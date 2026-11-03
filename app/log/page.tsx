'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AllergenMatch,
  AnalyzedIngredient,
  COMMON_SYMPTOMS,
  MEAL_TYPES,
  MealAnalysis,
  MealLog,
  MealType,
  STORAGE_KEYS,
  UserProfile,
} from '../types';
import { useLanguage } from '../components/LanguageProvider';
import { TFunction } from '../i18n/translations';
import { analyzeReactionLog, requestMealAnalysis, analysesRemaining, AnalyzeError } from '../lib/ai';
import {
  crossCheckAllergens,
  computeRiskLevel,
  CUSTOM_PREFIX,
  migrateAllergies,
  needsMigration,
} from '../lib/allergens';
import { compressImage } from '../lib/image';
import { computeProgress } from '../lib/analysis';

const MAX_IMAGE_SIZE_MB = 12; // generous: we downscale/compress client-side before upload
const ANALYSIS_TIMEOUT_MS = 30000;
const SLOW_NOTE_AFTER_S = 15;

type StepId = 'prepare' | 'model' | 'crosscheck' | 'build';
type StepState = 'pending' | 'active' | 'done' | 'failed';
const STEP_ORDER: StepId[] = ['prepare', 'model', 'crosscheck', 'build'];
const freshSteps = (): Record<StepId, StepState> => ({
  prepare: 'pending',
  model: 'pending',
  crosscheck: 'pending',
  build: 'pending',
});

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function allergenLabel(id: string, t: TFunction): string {
  if (id.startsWith(CUSTOM_PREFIX)) return id.slice(CUSTOM_PREFIX.length);
  return t('allergen.' + id);
}

export default function LogPage() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mealType, setMealType] = useState<MealType | ''>('');
  const [mealTime, setMealTime] = useState<string>('');
  const [mealName, setMealName] = useState('');
  const [description, setDescription] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null); // object URL for the thumbnail
  const [photoError, setPhotoError] = useState('');
  const [hasReaction, setHasReaction] = useState(false);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Inline AI analysis flow (meals only). On success the meal is auto-saved (no review).
  const [phase, setPhase] = useState<'form' | 'analyzing'>('form');
  const [analyzeError, setAnalyzeError] = useState<AnalyzeError | null>(null);
  const [steps, setSteps] = useState<Record<StepId, StepState>>(freshSteps);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Compression cache + analysis control (refs so they survive re-renders).
  const compressedRef = useRef<string | null>(null); // compressed JPEG dataURL for the current file
  const abortRef = useRef<AbortController | null>(null);
  const timedOutRef = useRef(false);
  const cancelledRef = useRef(false);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Idempotent meal id: generated once per Analyze, reused across Try again / reloads.
  const pendingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (!raw) {
      router.replace('/onboarding');
      return;
    }
    const loaded: UserProfile = JSON.parse(raw);
    if (needsMigration(loaded.allergies)) {
      loaded.allergies = migrateAllergies(loaded.allergies);
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(loaded));
    }
    setProfile(loaded);
    setMealTime(getCurrentTime());
  }, [router]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_IMAGE_SIZE_MB) {
      setPhotoError(t('modal.photoTooLarge', { size: sizeMB.toFixed(1), max: MAX_IMAGE_SIZE_MB }));
      return;
    }
    setPhotoError('');
    // Keep the raw file; actual compression happens at analyze/save time (honest "prepare" step).
    compressedRef.current = null;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
    compressedRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Compress the selected photo once (cached). Returns undefined when there's no photo.
  const ensurePhotoData = async (): Promise<string | undefined> => {
    if (!photoFile) return undefined;
    if (compressedRef.current) return compressedRef.current;
    const dataUrl = await compressImage(photoFile, 1024, 0.8);
    compressedRef.current = dataUrl;
    return dataUrl;
  };

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const toggleSymptom = (symptom: string) => {
    setSymptoms((prev) => (prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!mealName.trim()) errs.mealName = t('log.mealNameError');
    return errs;
  };

  // Idempotent meal id: created once per Analyze, persisted so Try again / reloads reuse it
  // (retries never create duplicates). Cleared on a successful save or when leaving the form.
  const getMealId = (): string => {
    if (!pendingIdRef.current) {
      pendingIdRef.current = localStorage.getItem(STORAGE_KEYS.PENDING_MEAL_ID) || Date.now().toString();
      localStorage.setItem(STORAGE_KEYS.PENDING_MEAL_ID, pendingIdRef.current);
    }
    return pendingIdRef.current;
  };
  const clearPendingId = () => {
    pendingIdRef.current = null;
    localStorage.removeItem(STORAGE_KEYS.PENDING_MEAL_ID);
  };
  // Drop the pending id if the user leaves the New Meal page without saving.
  useEffect(() => () => localStorage.removeItem(STORAGE_KEYS.PENDING_MEAL_ID), []);

  const persistAndGo = (log: MealLog) => {
    const rawLogs = localStorage.getItem(STORAGE_KEYS.LOGS);
    const existingLogs: MealLog[] = rawLogs ? JSON.parse(rawLogs) : [];
    // Idempotent write: replace if the id already exists (retry/reload), else append.
    const next = existingLogs.some((l) => l.id === log.id)
      ? existingLogs.map((l) => (l.id === log.id ? log : l))
      : [...existingLogs, log];
    try {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(next));
      clearPendingId();
      router.replace('/dashboard');
    } catch {
      setSaving(false);
      setPhotoError(t('log.photoStorageError'));
    }
  };

  const buildLog = (id: string, photoData: string | undefined): MealLog => ({
    id,
    mealName: mealName.trim(),
    description: description.trim(),
    photoUrl: photoData,
    hasReaction,
    symptoms: hasReaction ? symptoms : [],
    mealType: mealType || undefined,
    mealTime: mealTime || undefined,
    createdAt: new Date().toISOString(),
  });

  // Reaction path (unchanged behavior): save instantly + background reaction analysis.
  const handleSaveReaction = async () => {
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    const photoData = await ensurePhotoData();
    const log: MealLog = { ...buildLog(getMealId(), photoData), reactionAnalysisStatus: 'pending' };
    void analyzeReactionLog(log, profile?.allergies ?? [], language);
    persistAndGo(log);
  };

  const setStep = (id: StepId, state: StepState) => setSteps((prev) => ({ ...prev, [id]: state }));

  const stopElapsed = () => {
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = null;
  };

  // Merge the code-driven allergen cross-check exactly like the server route does,
  // but run it client-side so the "Checking against your allergies" step is real.
  const computeMatches = (a: MealAnalysis): AllergenMatch[] => {
    const ids = profile?.allergies ?? [];
    const fromIngredients = crossCheckAllergens(a.ingredients ?? [], ids);
    const fromTraces = crossCheckAllergens(a.traces ?? [], ids, { baseStrength: 'possible' });
    const fromHidden = crossCheckAllergens(a.possibleHiddenAllergens ?? [], ids, { baseStrength: 'possible' });
    const best = new Map<string, AllergenMatch>();
    for (const m of [...fromIngredients, ...fromTraces, ...fromHidden]) {
      const key = `${m.allergenId}::${m.ingredient.toLowerCase()}`;
      const prev = best.get(key);
      if (!prev || (prev.strength === 'possible' && m.strength === 'match')) best.set(key, m);
    }
    return [...best.values()];
  };

  // Meal path: full-screen phased progress, then AUTO-SAVE and go Home (no review screen).
  const runAnalysis = async () => {
    if (phase === 'analyzing') return; // double-submit guard
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    getMealId(); // fix the idempotent id now, before any save/retry
    setAnalyzeError(null);
    setSteps(freshSteps());
    setElapsedSec(0);
    cancelledRef.current = false;
    timedOutRef.current = false;
    setPhase('analyzing');

    // 1) Preparing the photo (real client-side compression).
    setStep('prepare', 'active');
    const photoData = await ensurePhotoData();
    if (cancelledRef.current) return;
    setStep('prepare', 'done');

    // 2) Reading the meal with AI (the model call) — caller owns cancel + timeout.
    setStep('model', 'active');
    const controller = new AbortController();
    abortRef.current = controller;
    stopElapsed();
    const startedAt = Date.now();
    elapsedTimerRef.current = setInterval(() => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    const timeout = setTimeout(() => {
      timedOutRef.current = true;
      controller.abort();
    }, ANALYSIS_TIMEOUT_MS);

    const res = await requestMealAnalysis(
      { mealName: mealName.trim(), description: description.trim(), photoDataUrl: photoData, knownAllergies: profile?.allergies ?? [], language },
      controller.signal
    );
    clearTimeout(timeout);
    stopElapsed();
    abortRef.current = null;

    if (cancelledRef.current) return; // user cancelled → already back on the form

    if (!res.analysis) {
      setStep('model', 'failed');
      setAnalyzeError(timedOutRef.current ? 'timeout' : res.error ?? 'other');
      return; // stay on the progress screen with recovery actions (nothing saved)
    }
    setStep('model', 'done');

    // 3) Checking against the user's allergies (lib/allergens cross-check, client-side).
    setStep('crosscheck', 'active');
    const matches = computeMatches(res.analysis);
    setStep('crosscheck', 'done');

    // 4) Build the result and AUTO-SAVE, then go Home with a highlight + toast marker.
    setStep('build', 'active');
    const finalAnalysis: MealAnalysis = { ...res.analysis, detectedAllergens: matches, riskLevel: computeRiskLevel(matches) };
    setStep('build', 'done');

    const log: MealLog = { ...buildLog(getMealId(), photoData), analysis: finalAnalysis, analysisStatus: 'done' };
    localStorage.setItem(STORAGE_KEYS.LAST_SAVED, JSON.stringify({ id: log.id, at: Date.now() }));
    persistAndGo(log);
  };

  const cancelAnalysis = () => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    stopElapsed();
    setAnalyzeError(null);
    setPhase('form'); // inputs are untouched
  };

  const backToEdit = () => {
    stopElapsed();
    setAnalyzeError(null);
    setPhase('form');
  };

  const saveMealWithoutAnalysis = async () => {
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      setPhase('form');
      return;
    }
    setSaving(true);
    const photoData = await ensurePhotoData();
    persistAndGo(buildLog(getMealId(), photoData));
  };

  // Warn on tab close / browser back while analyzing; cancel on back.
  useEffect(() => {
    if (phase !== 'analyzing') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onPopState = () => cancelAnalysis();
    window.addEventListener('beforeunload', onBeforeUnload);
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (!profile) return null;

  const overLimit = analysesRemaining() <= 0;

  // Full-page analysis progress (replaces the form; the form's React state is preserved).
  if (phase === 'analyzing') {
    return (
      <AnalysisProgress
        mealName={mealName.trim()}
        photoPreview={photoPreview}
        steps={steps}
        elapsedSec={elapsedSec}
        progress={computeProgress(steps, elapsedSec)}
        error={analyzeError}
        t={t}
        onCancel={cancelAnalysis}
        onRetry={() => runAnalysis()}
        onBackToEdit={backToEdit}
        onSaveWithout={saveMealWithoutAnalysis}
      />
    );
  }

  return (
    <div className="min-h-screen app-bg">
      {/* Header */}
      <header className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-200/70 dark:border-gray-800/70 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="press w-11 h-11 flex items-center justify-center rounded-2xl bg-gray-100/80 dark:bg-gray-800/80 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-xl"
          >
            ←
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('log.title')}</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5 pb-28">
        {/* Tipo e horário */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 animate-fade-slide-up" style={{ animationDelay: '0s' }}>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('log.mealType')}</p>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {MEAL_TYPES.map((type) => {
              const selected = mealType === type.value;
              return (
                <button
                  key={type.value}
                  onClick={() => setMealType(selected ? '' : type.value)}
                  className={`press flex items-center gap-2.5 px-3 py-3 rounded-xl border text-left transition-colors ${
                    selected
                      ? 'bg-green-50 dark:bg-green-950 border-green-400 dark:border-green-700 text-green-800 dark:text-green-300'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <span className="icon-tile w-10 h-10 bg-gray-100 dark:bg-gray-700/60 text-2xl flex-shrink-0 shadow-none">{type.icon}</span>
                  <span className="text-sm font-semibold leading-tight">{t('meal.' + type.value)}</span>
                </button>
              );
            })}
          </div>

          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('modal.time')}</label>
          <input
            type="time"
            value={mealTime}
            onChange={(e) => setMealTime(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        {/* Nome da refeição */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 animate-fade-slide-up" style={{ animationDelay: '0.05s' }}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('log.mealName')} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={mealName}
            onChange={(e) => {
              setMealName(e.target.value);
              if (errors.mealName) setErrors((prev) => ({ ...prev, mealName: '' }));
            }}
            placeholder={t('log.mealNamePlaceholder')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            autoFocus
          />
          {errors.mealName && <p className="mt-1.5 text-sm text-red-500">{errors.mealName}</p>}
        </div>

        {/* Descrição */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 animate-fade-slide-up" style={{ animationDelay: '0.1s' }}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('log.description')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('log.descriptionPlaceholder')}
            rows={4}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Foto */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 animate-fade-slide-up" style={{ animationDelay: '0.15s' }}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('log.photoLabel')}</label>

          {photoPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt={t('log.photoLabel')} className="w-full h-52 object-cover" />
              <button
                onClick={clearPhoto}
                className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-sm font-bold"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-36 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-green-400 dark:hover:border-green-600 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500 hover:text-green-500 dark:hover:text-green-400"
            >
              <span className="text-3xl">📷</span>
              <span className="text-sm font-medium">{t('log.photoTap')}</span>
              <span className="text-xs">{t('log.photoHint')}</span>
            </button>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
          {photoError && <p className="mt-2 text-sm text-red-500">{photoError}</p>}
        </div>

        {/* Reação */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 animate-fade-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">{t('log.reactionQuestion')}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('log.reactionSubtitle')}</p>
            </div>
            <button
              onClick={() => {
                setHasReaction((prev) => !prev);
                if (hasReaction) setSymptoms([]);
              }}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${hasReaction ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${hasReaction ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>

          {hasReaction && (
            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 animate-fade-slide-up">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('log.symptomsQuestion')}</p>
              <div className="grid grid-cols-2 gap-2">
                {COMMON_SYMPTOMS.map((symptom) => {
                  const selected = symptoms.includes(symptom);
                  return (
                    <button
                      key={symptom}
                      onClick={() => toggleSymptom(symptom)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm text-left ${
                        selected
                          ? 'bg-red-50 dark:bg-red-950 border-red-400 dark:border-red-700 text-red-700 dark:text-red-300'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-xs ${selected ? 'bg-red-500 border-red-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                        {selected && '✓'}
                      </span>
                      {t('symptom.' + symptom)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* AI status / errors (meal path) */}
        {!hasReaction && analyzeError && (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            {analyzeError === 'missing_key'
              ? t('ai.unavailable')
              : analyzeError === 'limit'
              ? t('ai.limitReached')
              : analyzeError === 'timeout'
              ? t('ai.timeout')
              : t('ai.analyzeError')}
          </p>
        )}
        {!hasReaction && overLimit && !analyzeError && (
          <p className="text-sm text-amber-600 dark:text-amber-500">{t('ai.limitReached')}</p>
        )}
      </main>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-t border-gray-200/70 dark:border-gray-800/70 px-4 py-4">
        <div className="max-w-lg mx-auto space-y-2">
          {hasReaction ? (
            <button
              onClick={handleSaveReaction}
              disabled={saving}
              className="cta-green press w-full disabled:opacity-60 text-white font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2.5"
            >
              {saving ? <span className="animate-pulse">{t('log.saving')}</span> : <><span className="text-xl">💾</span> {t('log.save')}</>}
            </button>
          ) : (
            <>
              <button
                onClick={() => (overLimit ? saveMealWithoutAnalysis() : runAnalysis())}
                disabled={saving}
                className="cta-green press w-full disabled:opacity-60 text-white font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2.5"
              >
                {overLimit ? (
                  <><span className="text-xl">💾</span> {t('log.save')}</>
                ) : (
                  <><span className="text-xl">✨</span> {t('log.analyzeReview')}</>
                )}
              </button>
              {!overLimit && (
                <button
                  onClick={saveMealWithoutAnalysis}
                  disabled={saving}
                  className="press w-full text-sm font-medium text-gray-500 dark:text-gray-400 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60"
                >
                  {t('log.saveWithout')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AnalysisProgress: full-screen phased progress view ─────────────────────────

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done')
    return <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs flex-shrink-0">✓</span>;
  if (state === 'failed')
    return <span className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs flex-shrink-0">✕</span>;
  if (state === 'active')
    return (
      <span className="w-6 h-6 rounded-full border-2 border-green-500 border-t-transparent motion-safe:animate-spin flex-shrink-0" aria-hidden />
    );
  return <span className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" aria-hidden />;
}

function AnalysisProgress({
  mealName,
  photoPreview,
  steps,
  elapsedSec,
  progress,
  error,
  t,
  onCancel,
  onRetry,
  onBackToEdit,
  onSaveWithout,
}: {
  mealName: string;
  photoPreview: string | null;
  steps: Record<StepId, StepState>;
  elapsedSec: number;
  progress: number; // 0..1, honest
  error: AnalyzeError | null;
  t: TFunction;
  onCancel: () => void;
  onRetry: () => void;
  onBackToEdit: () => void;
  onSaveWithout: () => void;
}) {
  const errorMessage = (e: AnalyzeError): string => {
    if (e === 'missing_key') return t('ai.unavailable');
    if (e === 'limit') return t('ai.limitReached');
    if (e === 'timeout') return t('ai.timeout');
    return t('ai.analyzeError');
  };

  const activeStep = STEP_ORDER.find((id) => steps[id] === 'active');
  const slow = steps.model === 'active' && elapsedSec >= SLOW_NOTE_AFTER_S;
  const currentLabel = activeStep ? t('analysis.step.' + activeStep) : t('analysis.title');
  const announce = error
    ? errorMessage(error)
    : activeStep
    ? `${t('analysis.step.' + activeStep)} — ${t('analysis.state.active')}`
    : '';

  return (
    <div className="min-h-screen app-bg">
      {/* Header matches the dashboard header style */}
      <header className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-200/70 dark:border-gray-800/70 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center gap-3">
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="" className="w-11 h-11 rounded-2xl object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700" />
          ) : (
            <span className="icon-tile w-11 h-11 bg-gray-100 dark:bg-gray-800 text-2xl flex-shrink-0 shadow-none">🍽️</span>
          )}
          <div className="min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('analysis.title')}</p>
            <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight truncate">{mealName || '…'}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Big honest progress bar in a Home-style card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{currentLabel}</p>
          </div>
          <div className="h-7 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className="analysis-bar h-full rounded-lg bg-green-500"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{elapsedSec}s</p>
            {slow && <p className="text-xs text-amber-600 dark:text-amber-500">{t('analysis.slow')}</p>}
          </div>
        </div>

        {/* Vertical step list */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5">
          <ol className="space-y-4">
            {STEP_ORDER.map((id) => {
              const state = steps[id];
              return (
                <li key={id} className="flex items-center gap-3">
                  <StepIcon state={state} />
                  <p
                    className={`text-sm font-medium ${
                      state === 'pending'
                        ? 'text-gray-400 dark:text-gray-500'
                        : state === 'failed'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {t('analysis.step.' + id)}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>

        <p aria-live="polite" className="sr-only">{announce}</p>

        {/* Error recovery or cancel */}
        {error ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-600 dark:text-amber-500">{errorMessage(error)}</p>
            <button onClick={onRetry} className="cta-green press w-full text-white font-semibold py-3.5 rounded-2xl">
              {t('analysis.retry')}
            </button>
            <div className="flex gap-3">
              <button
                onClick={onBackToEdit}
                className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {t('analysis.backToEdit')}
              </button>
              <button
                onClick={onSaveWithout}
                className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {t('log.saveWithout')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onCancel}
            className="press w-full py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 bg-white dark:bg-gray-900"
          >
            {t('analysis.cancel')}
          </button>
        )}
      </main>
    </div>
  );
}
