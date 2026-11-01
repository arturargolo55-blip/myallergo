'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COMMON_SYMPTOMS, MEAL_TYPES, MealLog, MealType, STORAGE_KEYS, UserProfile } from '../types';
import { useLanguage } from '../components/LanguageProvider';
import { analyzeMealLog } from '../lib/ai';

const MAX_IMAGE_SIZE_MB = 1.5;

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [hasReaction, setHasReaction] = useState(false);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (!raw) {
      router.replace('/onboarding');
      return;
    }
    setProfile(JSON.parse(raw));
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
    const reader = new FileReader();
    reader.onloadend = () => setPhotoUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleSymptom = (symptom: string) => {
    setSymptoms((prev) =>
      prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]
    );
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!mealName.trim()) errs.mealName = t('log.mealNameError');
    return errs;
  };

  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);

    const newLog: MealLog = {
      id: Date.now().toString(),
      mealName: mealName.trim(),
      description: description.trim(),
      photoUrl: photoUrl || undefined,
      hasReaction,
      symptoms: hasReaction ? symptoms : [],
      mealType: mealType || undefined,
      mealTime: mealTime || undefined,
      createdAt: new Date().toISOString(),
      analysisStatus: 'pending',
    };

    const rawLogs = localStorage.getItem(STORAGE_KEYS.LOGS);
    const existingLogs: MealLog[] = rawLogs ? JSON.parse(rawLogs) : [];

    try {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify([...existingLogs, newLog]));
      // Fire-and-forget AI analysis; it writes back to localStorage when done.
      // SPA navigation keeps the JS context alive, so the request survives the redirect.
      void analyzeMealLog(newLog, profile?.allergies ?? [], language);
      router.replace('/dashboard');
    } catch {
      setSaving(false);
      setPhotoError(t('log.photoStorageError'));
    }
  };

  if (!profile) return null;

  return (
    <div className="min-h-screen app-bg">
      {/* Header */}
      <header className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border-b border-gray-200/70 dark:border-gray-800/70 sticky top-0 z-10">
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
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            {t('log.mealType')}
          </p>
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

          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('modal.time')}
          </label>
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
          {errors.mealName && (
            <p className="mt-1.5 text-sm text-red-500">{errors.mealName}</p>
          )}
        </div>

        {/* Descrição */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 animate-fade-slide-up" style={{ animationDelay: '0.1s' }}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('log.description')}
          </label>
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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            {t('log.photoLabel')}
          </label>

          {photoUrl ? (
            <div className="relative rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt={t('log.photoLabel')} className="w-full h-52 object-cover" />
              <button
                onClick={() => {
                  setPhotoUrl(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
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
              <span className="text-xs">{t('log.photoFormat', { max: MAX_IMAGE_SIZE_MB })}</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
            className="hidden"
          />

          {photoError && <p className="mt-2 text-sm text-red-500">{photoError}</p>}
        </div>

        {/* Reação */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 animate-fade-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">{t('log.reactionQuestion')}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t('log.reactionSubtitle')}
              </p>
            </div>
            <button
              onClick={() => {
                setHasReaction((prev) => !prev);
                if (hasReaction) setSymptoms([]);
              }}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                hasReaction ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  hasReaction ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {hasReaction && (
            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 animate-fade-slide-up">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {t('log.symptomsQuestion')}
              </p>
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
                      <span
                        className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-xs ${
                          selected
                            ? 'bg-red-500 border-red-500 text-white'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
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
      </main>

      {/* Botão salvar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-t border-gray-200/70 dark:border-gray-800/70 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSave}
            disabled={saving}
            className="cta-green press w-full disabled:opacity-60 text-white font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2.5"
          >
            {saving ? (
              <span className="animate-pulse">{t('log.saving')}</span>
            ) : (
              <>
                <span className="text-xl">💾</span> {t('log.save')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
