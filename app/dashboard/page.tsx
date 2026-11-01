'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  COMMON_ALLERGIES,
  COMMON_SYMPTOMS,
  Likelihood,
  MealAnalysis,
  MealLog,
  ReactionAnalysis,
  MEAL_TYPES,
  MealType,
  PatternInsight,
  REACTION_INTENSITIES,
  ReactionIntensity,
  STORAGE_KEYS,
  UserProfile,
} from '../types';
import { useTheme } from '../components/ThemeProvider';
import { useLanguage } from '../components/LanguageProvider';
import { Language, TFunction } from '../i18n/translations';
import { analyzePatterns, analyzeReactionLog, askAI, buildLogSummary, ChatMessage } from '../lib/ai';

const MAX_PHOTO_MB = 1.5;

function getWeekDays(): Date[] {
  const today = new Date();
  const dow = today.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getMealTime(log: MealLog): string {
  if (log.mealTime) return log.mealTime;
  const d = new Date(log.createdAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── PencilIcon ───────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// ─── GearIcon ─────────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ─── ModalSheet ───────────────────────────────────────────────────────────────

function ModalSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 animate-fade-in" />
      <div
        className="relative z-10 w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl max-h-[92vh] overflow-y-auto animate-slide-up-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── EditAllergyModal ─────────────────────────────────────────────────────────

function EditAllergyModal({
  profile,
  onSave,
  onClose,
}: {
  profile: UserProfile;
  onSave: (allergies: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<string[]>(profile.allergies);
  const [customInput, setCustomInput] = useState('');

  const customList = selected.filter((a) => !COMMON_ALLERGIES.includes(a));

  const toggle = (a: string) =>
    setSelected((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    setSelected((prev) => [...prev, trimmed]);
    setCustomInput('');
  };

  const removeCustom = (a: string) => setSelected((prev) => prev.filter((x) => x !== a));

  return (
    <ModalSheet onClose={onClose}>
      <div className="px-5 pb-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('allergyModal.title')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {COMMON_ALLERGIES.map((allergy) => {
            const isSelected = selected.includes(allergy);
            return (
              <button
                key={allergy}
                onClick={() => toggle(allergy)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-colors ${
                  isSelected
                    ? 'bg-green-50 dark:bg-green-950 border-green-500 dark:border-green-600 text-green-700 dark:text-green-300'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-xs ${
                    isSelected
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {isSelected && '✓'}
                </span>
                {t('allergy.' + allergy)}
              </button>
            );
          })}
        </div>

        {customList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {customList.map((a) => (
              <span
                key={a}
                className="flex items-center gap-1 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-xs font-medium px-2.5 py-1 rounded-full"
              >
                {a}
                <button
                  onClick={() => removeCustom(a)}
                  className="hover:text-red-500 ml-0.5 leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustom()}
            placeholder={t('allergyModal.placeholder')}
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <button
            onClick={addCustom}
            disabled={!customInput.trim()}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700"
          >
            {t('allergyModal.add')}
          </button>
        </div>

        {selected.length === 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            {t('allergyModal.empty')}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {t('modal.cancel')}
          </button>
          <button
            onClick={() => onSave(selected)}
            className="cta-green press flex-1 py-3 rounded-xl text-white text-sm font-semibold"
          >
            {t('modal.save')}
          </button>
        </div>
      </div>
    </ModalSheet>
  );
}

// ─── EditMealModal ────────────────────────────────────────────────────────────

function EditMealModal({
  log,
  onSave,
  onClose,
}: {
  log: MealLog;
  onSave: (updated: MealLog) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mealType, setMealType] = useState<MealType | ''>(log.mealType ?? '');
  const [mealTime, setMealTime] = useState(log.mealTime ?? getMealTime(log));
  const [description, setDescription] = useState(log.description);
  const [photoUrl, setPhotoUrl] = useState<string | null>(log.photoUrl ?? null);
  const [photoError, setPhotoError] = useState('');

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_PHOTO_MB) {
      setPhotoError(t('modal.photoTooLarge', { size: sizeMB.toFixed(1), max: MAX_PHOTO_MB }));
      return;
    }
    setPhotoError('');
    const reader = new FileReader();
    reader.onloadend = () => setPhotoUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSave({
      ...log,
      mealType: mealType || undefined,
      mealTime: mealTime || undefined,
      description,
      photoUrl: photoUrl ?? undefined,
    });
  };

  return (
    <ModalSheet onClose={onClose}>
      <div className="px-5 pb-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('editMeal.title')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('editMeal.mealType')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {MEAL_TYPES.map((type) => {
              const selected = mealType === type.value;
              return (
                <button
                  key={type.value}
                  onClick={() => setMealType(selected ? '' : type.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-colors ${
                    selected
                      ? 'bg-green-50 dark:bg-green-950 border-green-400 dark:border-green-700 text-green-800 dark:text-green-300'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <span className="text-lg flex-shrink-0">{type.icon}</span>
                  <span className="font-medium leading-tight">{t('meal.' + type.value)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
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

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('modal.photo')}
          </label>
          {photoUrl ? (
            <div className="relative rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt={t('modal.photo')} className="w-full h-40 object-cover" />
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/30">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white/90 hover:bg-white text-gray-800 text-xs font-medium rounded-lg"
                >
                  {t('modal.changePhoto')}
                </button>
                <button
                  onClick={() => {
                    setPhotoUrl(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="px-3 py-1.5 bg-red-500/90 hover:bg-red-500 text-white text-xs font-medium rounded-lg"
                >
                  {t('modal.removePhoto')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-24 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-green-400 dark:hover:border-green-600 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 dark:text-gray-500"
            >
              <span className="text-2xl">📷</span>
              <span className="text-xs font-medium">{t('modal.addPhoto')}</span>
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
          {photoError && <p className="mt-1.5 text-xs text-red-500">{photoError}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('editMeal.description')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t('editMeal.descriptionPlaceholder')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {t('modal.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="cta-green press flex-1 py-3 rounded-xl text-white text-sm font-semibold"
          >
            {t('modal.save')}
          </button>
        </div>
      </div>
    </ModalSheet>
  );
}

// ─── EditReactionModal ────────────────────────────────────────────────────────

function EditReactionModal({
  log,
  onSave,
  onClose,
}: {
  log: MealLog;
  onSave: (updated: MealLog) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mealTime, setMealTime] = useState(log.mealTime ?? getMealTime(log));
  const [symptoms, setSymptoms] = useState<string[]>(log.symptoms);
  const [intensity, setIntensity] = useState<ReactionIntensity | ''>(
    log.reactionIntensity ?? ''
  );
  const [reactionNotes, setReactionNotes] = useState(log.reactionNotes ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(log.photoUrl ?? null);
  const [photoError, setPhotoError] = useState('');

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_PHOTO_MB) {
      setPhotoError(t('modal.photoTooLarge', { size: sizeMB.toFixed(1), max: MAX_PHOTO_MB }));
      return;
    }
    setPhotoError('');
    const reader = new FileReader();
    reader.onloadend = () => setPhotoUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleSymptom = (s: string) =>
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const handleSave = () => {
    onSave({
      ...log,
      mealTime: mealTime || undefined,
      symptoms,
      reactionIntensity: intensity || undefined,
      reactionNotes: reactionNotes.trim() || undefined,
      photoUrl: photoUrl ?? undefined,
    });
  };

  return (
    <ModalSheet onClose={onClose}>
      <div className="px-5 pb-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('editReaction.title')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div>
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

        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('editReaction.intensity')}
          </p>
          <div className="flex gap-2">
            {REACTION_INTENSITIES.map((r) => (
              <button
                key={r.value}
                onClick={() => setIntensity(intensity === r.value ? '' : r.value)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  intensity === r.value
                    ? 'bg-red-50 dark:bg-red-950 border-red-400 dark:border-red-700 text-red-700 dark:text-red-300'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span className="text-xl">{r.emoji}</span>
                {t('intensity.' + r.value)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('editReaction.symptoms')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {COMMON_SYMPTOMS.map((s) => {
              const selected = symptoms.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleSymptom(s)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm text-left transition-colors ${
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
                  {t('symptom.' + s)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('editReaction.notes')}
          </label>
          <textarea
            value={reactionNotes}
            onChange={(e) => setReactionNotes(e.target.value)}
            rows={3}
            placeholder={t('editReaction.notesPlaceholder')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('modal.photo')}
          </label>
          {photoUrl ? (
            <div className="relative rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt={t('modal.photo')} className="w-full h-40 object-cover" />
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/30">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white/90 hover:bg-white text-gray-800 text-xs font-medium rounded-lg"
                >
                  {t('modal.changePhoto')}
                </button>
                <button
                  onClick={() => { setPhotoUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="px-3 py-1.5 bg-red-500/90 hover:bg-red-500 text-white text-xs font-medium rounded-lg"
                >
                  {t('modal.removePhoto')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-24 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-red-400 dark:hover:border-red-600 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 dark:text-gray-500"
            >
              <span className="text-2xl">📷</span>
              <span className="text-xs font-medium">{t('modal.addPhoto')}</span>
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
          {photoError && <p className="mt-1.5 text-xs text-red-500">{photoError}</p>}
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {t('modal.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="cta-red press flex-1 py-3 rounded-xl text-white text-sm font-semibold"
          >
            {t('modal.save')}
          </button>
        </div>
      </div>
    </ModalSheet>
  );
}

// ─── LogReactionModal ─────────────────────────────────────────────────────────

function LogReactionModal({
  onSave,
  onClose,
}: {
  onSave: (log: MealLog) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const [context, setContext] = useState('');
  const [mealTime, setMealTime] = useState(defaultTime);
  const [intensity, setIntensity] = useState<ReactionIntensity | ''>('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [reactionNotes, setReactionNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_PHOTO_MB) {
      setPhotoError(t('modal.photoTooLarge', { size: sizeMB.toFixed(1), max: MAX_PHOTO_MB }));
      return;
    }
    setPhotoError('');
    const reader = new FileReader();
    reader.onloadend = () => setPhotoUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleSymptom = (s: string) =>
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const handleSave = () => {
    const log: MealLog = {
      id: Date.now().toString(),
      mealName: context.trim() || t('logReaction.defaultName'),
      description: '',
      symptoms,
      hasReaction: true,
      mealTime: mealTime || undefined,
      reactionIntensity: intensity || undefined,
      reactionNotes: reactionNotes.trim() || undefined,
      photoUrl: photoUrl ?? undefined,
      createdAt: new Date().toISOString(),
    };
    onSave(log);
  };

  return (
    <ModalSheet onClose={onClose}>
      <div className="px-5 pb-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('logReaction.title')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('logReaction.context')}{' '}
            <span className="font-normal text-gray-400 dark:text-gray-500">{t('logReaction.contextOptional')}</span>
          </label>
          <input
            type="text"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={t('logReaction.contextPlaceholder')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('modal.time')}
          </label>
          <input
            type="time"
            value={mealTime}
            onChange={(e) => setMealTime(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
          />
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('editReaction.intensity')}
          </p>
          <div className="flex gap-2">
            {REACTION_INTENSITIES.map((r) => (
              <button
                key={r.value}
                onClick={() => setIntensity(intensity === r.value ? '' : r.value)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  intensity === r.value
                    ? 'bg-red-50 dark:bg-red-950 border-red-400 dark:border-red-700 text-red-700 dark:text-red-300'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span className="text-xl">{r.emoji}</span>
                {t('intensity.' + r.value)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('editReaction.symptoms')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {COMMON_SYMPTOMS.map((s) => {
              const sel = symptoms.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleSymptom(s)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm text-left transition-colors ${
                    sel
                      ? 'bg-red-50 dark:bg-red-950 border-red-400 dark:border-red-700 text-red-700 dark:text-red-300'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-xs ${
                      sel
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {sel && '✓'}
                  </span>
                  {t('symptom.' + s)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('editReaction.notes')}
          </label>
          <textarea
            value={reactionNotes}
            onChange={(e) => setReactionNotes(e.target.value)}
            rows={3}
            placeholder={t('editReaction.notesPlaceholder')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('modal.photo')}
          </label>
          {photoUrl ? (
            <div className="relative rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt={t('modal.photo')} className="w-full h-40 object-cover" />
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/30">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white/90 hover:bg-white text-gray-800 text-xs font-medium rounded-lg"
                >
                  {t('modal.changePhoto')}
                </button>
                <button
                  onClick={() => { setPhotoUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="px-3 py-1.5 bg-red-500/90 hover:bg-red-500 text-white text-xs font-medium rounded-lg"
                >
                  {t('modal.removePhoto')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-24 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-red-400 dark:hover:border-red-600 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 dark:text-gray-500"
            >
              <span className="text-2xl">📷</span>
              <span className="text-xs font-medium">{t('modal.addPhoto')}</span>
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
          {photoError && <p className="mt-1.5 text-xs text-red-500">{photoError}</p>}
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {t('modal.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="cta-red press flex-1 py-3 rounded-xl text-white text-sm font-semibold"
          >
            {t('logReaction.register')}
          </button>
        </div>
      </div>
    </ModalSheet>
  );
}

// ─── DaySelector ─────────────────────────────────────────────────────────────

function DaySelector({
  weekDays,
  selectedDay,
  onChange,
}: {
  weekDays: Date[];
  selectedDay: Date | null;
  onChange: (day: Date | null) => void;
}) {
  const { t } = useLanguage();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
      {weekDays.map((day, i) => {
        const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
        const isToday = isSameDay(day, today);

        return (
          <button
            key={i}
            onClick={() => onChange(isSelected ? null : day)}
            className={`press flex-shrink-0 flex flex-col items-center px-3.5 py-2.5 rounded-2xl min-w-[54px] transition-colors ${
              isSelected
                ? 'cta-green text-white'
                : isToday
                ? 'bg-white dark:bg-gray-900 text-green-600 dark:text-green-400 border border-green-300 dark:border-green-700'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <span className="text-xs font-medium">{t('day.' + i)}</span>
            <span className="text-sm font-bold mt-0.5">{day.getDate()}</span>
            {isToday && !isSelected && (
              <span className="w-1 h-1 rounded-full bg-green-500 mt-0.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── CompactMealCard ──────────────────────────────────────────────────────────

function CompactMealCard({
  log,
  onEdit,
  onDelete,
  onAsk,
  showDeleteConfirm,
  onConfirmDelete,
  onCancelDelete,
}: {
  log: MealLog;
  onEdit: () => void;
  onDelete: () => void;
  onAsk: () => void;
  showDeleteConfirm: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { t } = useLanguage();
  const mealTypeInfo = log.mealType ? MEAL_TYPES.find((tp) => tp.value === log.mealType) : null;
  const icon = mealTypeInfo?.icon ?? '🍽️';
  const time = getMealTime(log);

  return (
    <div
      className={`hover-lift bg-white dark:bg-gray-900 rounded-xl border overflow-hidden ${
        log.hasReaction
          ? 'border-red-100 dark:border-red-900'
          : 'border-gray-100 dark:border-gray-800'
      }`}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        <span className="icon-tile w-11 h-11 bg-gray-100 dark:bg-gray-800 text-2xl flex-shrink-0 shadow-none">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {log.mealName}
          </p>
          {mealTypeInfo && (
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('meal.' + mealTypeInfo.value)}</p>
          )}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{time}</span>

        {log.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={log.photoUrl}
            alt=""
            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-100 dark:border-gray-700"
          />
        )}

        <span
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            log.hasReaction ? 'bg-red-500' : 'bg-green-500'
          }`}
        />

        <button
          onClick={onEdit}
          className="text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-400 flex-shrink-0 p-1"
          title={t('modal.edit')}
        >
          <PencilIcon />
        </button>

        <button
          onClick={onDelete}
          className="text-gray-300 dark:text-gray-600 hover:text-red-400 text-base flex-shrink-0 px-0.5 leading-none"
          title={t('modal.delete')}
        >
          ···
        </button>
      </div>
      {(log.analysis || log.analysisStatus === 'pending') && (
        <div className="px-4 pb-3">
          <MealAnalysisBadge log={log} />
          {log.analysis && (
            <button
              onClick={onAsk}
              className="press mt-2 ml-14 text-xs font-semibold text-green-600 dark:text-green-400 hover:underline"
            >
              💬 {t('ai.chat.button')}
            </button>
          )}
        </div>
      )}
      {showDeleteConfirm && (
        <div className="px-4 pb-3 flex gap-2 border-t border-gray-100 dark:border-gray-800 pt-2.5 animate-fade-slide-up">
          <button
            onClick={onConfirmDelete}
            className="flex-1 text-xs bg-red-500 hover:bg-red-600 text-white py-1.5 rounded-lg font-medium"
          >
            {t('meals.confirmDelete')}
          </button>
          <button
            onClick={onCancelDelete}
            className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 py-1.5 rounded-lg font-medium"
          >
            {t('meals.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ReactionCard ─────────────────────────────────────────────────────────────

function ReactionCard({
  log,
  onEdit,
  onDelete,
  onAsk,
  showDeleteConfirm,
  onConfirmDelete,
  onCancelDelete,
}: {
  log: MealLog;
  onEdit: () => void;
  onDelete: () => void;
  onAsk: () => void;
  showDeleteConfirm: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { language, t } = useLanguage();
  // Reactions always use the ⚡ icon, never a meal-type plate icon.
  const icon = '⚡';
  const time = getMealTime(log);
  const locale = language === 'en' ? 'en-US' : 'pt-BR';
  const date = new Date(log.createdAt).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
  });
  const intensityInfo = log.reactionIntensity
    ? REACTION_INTENSITIES.find((r) => r.value === log.reactionIntensity)
    : null;

  return (
    <div className="hover-lift bg-white dark:bg-gray-900 rounded-xl border border-red-100 dark:border-red-900 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="icon-tile w-11 h-11 bg-red-50 dark:bg-red-950 text-2xl flex-shrink-0 shadow-none">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {log.mealName}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {date} · {time}
            {intensityInfo && (
              <span className="ml-1.5">
                {intensityInfo.emoji} {t('intensity.' + intensityInfo.value)}
              </span>
            )}
          </p>
        </div>
        {log.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={log.photoUrl}
            alt=""
            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-red-100 dark:border-red-900"
          />
        )}
        <button
          onClick={onEdit}
          className="text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-400 flex-shrink-0 p-1"
          title={t('modal.editReaction')}
        >
          <PencilIcon />
        </button>
        <span className="text-xs bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800 flex-shrink-0">
          {t('reactions.badge')}
        </span>
        <button
          onClick={onDelete}
          className="text-gray-300 dark:text-gray-600 hover:text-red-400 text-base flex-shrink-0 px-0.5 leading-none"
          title={t('modal.delete')}
        >
          ···
        </button>
      </div>
      {log.symptoms.length > 0 && (
        <div className="mt-2 ml-14 flex flex-wrap gap-1">
          {log.symptoms.map((s) => (
            <span
              key={s}
              className="text-xs bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full"
            >
              {t('symptom.' + s)}
            </span>
          ))}
        </div>
      )}
      {log.reactionNotes && (
        <p className="mt-2 ml-14 text-xs text-gray-500 dark:text-gray-400 italic">
          {log.reactionNotes}
        </p>
      )}
      {(log.reactionAnalysis || log.reactionAnalysisStatus === 'pending') && (
        <ReactionAnalysisBadge log={log} />
      )}
      {log.reactionAnalysis && (
        <button
          onClick={onAsk}
          className="press mt-2 ml-14 text-xs font-semibold text-green-600 dark:text-green-400 hover:underline"
        >
          💬 {t('ai.chat.button')}
        </button>
      )}
      {showDeleteConfirm && (
        <div className="mt-3 flex gap-2 border-t border-gray-100 dark:border-gray-800 pt-2.5 animate-fade-slide-up">
          <button
            onClick={onConfirmDelete}
            className="flex-1 text-xs bg-red-500 hover:bg-red-600 text-white py-1.5 rounded-lg font-medium"
          >
            {t('meals.confirmDelete')}
          </button>
          <button
            onClick={onCancelDelete}
            className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 py-1.5 rounded-lg font-medium"
          >
            {t('meals.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MealAnalysisBadge ──────────────────────────────────────────────────────

function MealAnalysisBadge({ log }: { log: MealLog }) {
  const { t } = useLanguage();

  if (log.analysisStatus === 'pending') {
    return (
      <p className="mt-2 ml-14 text-xs text-gray-400 dark:text-gray-500 animate-pulse">
        ✨ {t('ai.analyzing')}
      </p>
    );
  }

  const a = log.analysis;
  if (!a) return null;

  return (
    <div className="mt-2 ml-14 space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {typeof a.calories === 'number' && (
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
            🔥 {a.calories} {t('ai.kcal')}
          </span>
        )}
        {a.macros && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            · P {Math.round(a.macros.protein_g)}{t('ai.gram')} · C {Math.round(a.macros.carbs_g)}{t('ai.gram')} · G{' '}
            {Math.round(a.macros.fat_g)}{t('ai.gram')}
          </span>
        )}
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          · {t('ai.confidence')}: {t('ai.confidence.' + a.confidence)}
        </span>
        {a.allergens?.map((al) => (
          <span
            key={al}
            className="text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full"
          >
            ⚠️ {al}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">{t('ai.mealDisclaimer')}</p>
    </div>
  );
}

// ─── ReactionAnalysisBadge ──────────────────────────────────────────────────

function ReactionAnalysisBadge({ log }: { log: MealLog }) {
  const { t } = useLanguage();

  if (log.reactionAnalysisStatus === 'pending') {
    return (
      <p className="mt-2 ml-14 text-xs text-gray-400 dark:text-gray-500 animate-pulse">
        ✨ {t('ai.analyzing')}
      </p>
    );
  }

  const a = log.reactionAnalysis;
  if (!a) return null;

  return (
    <div className="mt-2 ml-14 space-y-1.5">
      {a.urgency === 'seek_care' && (
        <p className="text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-2 py-1">
          🚨 {t('ai.reaction.seekCare')}
        </p>
      )}
      <p className="text-xs text-gray-600 dark:text-gray-300">🧠 {a.assessment}</p>
      {a.possibleTriggers?.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{t('ai.possibleTriggers')}:</span>
          {a.possibleTriggers.map((tr) => (
            <span
              key={tr}
              className="text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full"
            >
              ⚠️ {tr}
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">{t('ai.reactionDisclaimer')}</p>
    </div>
  );
}

// ─── AIInsightsPanel ────────────────────────────────────────────────────────

const LIKELIHOOD_STYLES: Record<Likelihood, string> = {
  high: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  medium: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  low: 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
};

const MIN_REACTIONS_FOR_HIGH = 3;

function AIInsightsPanel({
  insight,
  loading,
  error,
  onRun,
  canRun,
  reactionCount,
  t,
  language,
}: {
  insight: PatternInsight | null;
  loading: boolean;
  error: 'missing_key' | 'other' | null;
  onRun: () => void;
  canRun: boolean;
  reactionCount: number;
  t: TFunction;
  language: Language;
}) {
  const locale = language === 'en' ? 'en-US' : 'pt-BR';
  // Not enough reactions to support a strong verdict — clamp "high" down to "medium".
  const lowData = reactionCount < MIN_REACTIONS_FOR_HIGH;
  const suspects = (insight?.suspects ?? []).map((s) =>
    lowData && s.likelihood === 'high' ? { ...s, likelihood: 'medium' as Likelihood } : s
  );

  return (
    <div className="hover-lift bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100">
          <span className="text-2xl">🧠</span> {t('ai.insights.title')}
        </h2>
        <button
          onClick={onRun}
          disabled={loading || !canRun}
          className="press text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-400 disabled:opacity-40"
        >
          {loading ? t('ai.insights.analyzing') : insight ? t('ai.insights.refresh') : t('ai.insights.run')}
        </button>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{t('ai.insights.subtitle')}</p>

      {!canRun && !insight && (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t('ai.insights.needData')}</p>
      )}

      {error === 'missing_key' && (
        <p className="text-sm text-amber-600 dark:text-amber-500">{t('ai.unavailable')}</p>
      )}
      {error === 'other' && (
        <p className="text-sm text-red-500">{t('ai.insights.error')}</p>
      )}

      {insight && (
        <div className="space-y-3">
          {lowData && (
            <p className="text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
              {t('ai.insights.lowData')}
            </p>
          )}
          {suspects.length > 0 ? (
            <div className="space-y-2">
              {suspects.map((s, i) => (
                <div
                  key={`${s.name}-${i}`}
                  className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 animate-fade-slide-up"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{s.name}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border ${LIKELIHOOD_STYLES[s.likelihood]}`}
                    >
                      {t('ai.likelihood.' + s.likelihood)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.evidence}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t('ai.insights.noSuspects')}</p>
          )}

          {insight.summary && (
            <p className="text-sm text-gray-700 dark:text-gray-300">{insight.summary}</p>
          )}

          <p className="text-xs text-gray-400 dark:text-gray-500 italic border-t border-gray-100 dark:border-gray-800 pt-2">
            ⚕️ {insight.disclaimer}
          </p>
          <p className="text-[11px] text-gray-300 dark:text-gray-600">
            {t('ai.insights.updatedAt', {
              when: new Date(insight.generatedAt).toLocaleString(locale, {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── ChatSheet ──────────────────────────────────────────────────────────────

function ChatSheet({
  log,
  onClose,
  onUpdate,
}: {
  log: MealLog;
  onClose: () => void;
  onUpdate: (update: { mealUpdate?: Partial<MealAnalysis>; reactionUpdate?: Partial<ReactionAnalysis> }) => void;
}) {
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'missing_key' | 'other' | null>(null);
  const summary = useMemo(() => buildLogSummary(log), [log]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const suggestions = log.hasReaction
    ? [t('ai.chat.r1'), t('ai.chat.r2'), t('ai.chat.r3')]
    : [t('ai.chat.m1'), t('ai.chat.m2'), t('ai.chat.m3')];

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    setLoading(true);
    setError(null);
    const res = await askAI(summary, next, language, {
      photoDataUrl: log.photoUrl,
      kind: log.hasReaction ? 'reaction' : 'meal',
    });
    if (res.mealUpdate || res.reactionUpdate) {
      onUpdate({ mealUpdate: res.mealUpdate, reactionUpdate: res.reactionUpdate });
    }
    if (res.reply) {
      setMessages([...next, { role: 'assistant', content: res.reply }]);
    } else if (!res.mealUpdate && !res.reactionUpdate) {
      setError(res.error ?? 'other');
    }
    setLoading(false);
  };

  return (
    <ModalSheet onClose={onClose}>
      <div className="px-5 pb-6 flex flex-col" style={{ maxHeight: '82vh' }}>
        <div className="flex items-center justify-between pb-2">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              <span>💬</span> {t('ai.chat.title')}
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{log.mealName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xl leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 py-2 min-h-[160px]">
          {messages.length === 0 && !loading && (
            <div className="space-y-2">
              <p className="text-sm text-gray-400 dark:text-gray-500">{t('ai.chat.empty')}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="press text-xs text-left bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-full hover:border-green-400 dark:hover:border-green-600"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] text-sm rounded-2xl px-3.5 py-2 whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-green-500 text-white rounded-br-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 text-sm rounded-2xl rounded-bl-sm px-3.5 py-2 animate-pulse">
                …
              </div>
            </div>
          )}

          {error === 'missing_key' && <p className="text-sm text-amber-600 dark:text-amber-500">{t('ai.unavailable')}</p>}
          {error === 'other' && <p className="text-sm text-red-500">{t('ai.chat.error')}</p>}
        </div>

        <div className="flex items-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={t('ai.chat.placeholder')}
            className="flex-1 resize-none px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="cta-green press text-white font-semibold text-sm px-4 py-2.5 rounded-2xl disabled:opacity-40 flex-shrink-0"
          >
            {t('ai.chat.send')}
          </button>
        </div>
      </div>
    </ModalSheet>
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [logs, setLogs] = useState<MealLog[]>([]);
  const [activeTab, setActiveTab] = useState<'inicio' | 'refeicoes' | 'reacoes'>('inicio');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const [editLog, setEditLog] = useState<MealLog | null>(null);
  const [editMode, setEditMode] = useState<'meal' | 'reaction' | null>(null);
  const [showAllergyModal, setShowAllergyModal] = useState(false);
  const [showLogReactionModal, setShowLogReactionModal] = useState(false);

  const [chatLog, setChatLog] = useState<MealLog | null>(null);
  const [patternInsight, setPatternInsight] = useState<PatternInsight | null>(null);
  const [patternLoading, setPatternLoading] = useState(false);
  const [patternError, setPatternError] = useState<'missing_key' | 'other' | null>(null);

  const weekDays = useMemo(() => getWeekDays(), []);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (!raw) {
      router.replace('/onboarding');
      return;
    }
    setProfile(JSON.parse(raw));

    const rawLogs = localStorage.getItem(STORAGE_KEYS.LOGS);
    if (rawLogs) {
      const parsed: MealLog[] = JSON.parse(rawLogs);
      setLogs(
        parsed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );
    }

    const rawInsight = localStorage.getItem(STORAGE_KEYS.AI_INSIGHTS);
    if (rawInsight) {
      try {
        setPatternInsight(JSON.parse(rawInsight));
      } catch {
        /* ignore malformed cache */
      }
    }
  }, [router]);

  // While any meal analysis is in flight (written from the /log page or the quick-reaction
  // modal), re-read localStorage until it lands so the cards update in place.
  const hasPending = useMemo(
    () => logs.some((l) => l.analysisStatus === 'pending' || l.reactionAnalysisStatus === 'pending'),
    [logs]
  );
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => {
      const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
      if (!raw) return;
      const parsed: MealLog[] = JSON.parse(raw);
      setLogs(parsed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, 2500);
    return () => clearInterval(id);
  }, [hasPending]);

  const deleteLog = (id: string) => {
    const updated = logs.filter((l) => l.id !== id);
    setLogs(updated);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(updated));
    setDeleteId(null);
  };

  const saveEdit = (updated: MealLog) => {
    const updatedLogs = logs.map((l) => (l.id === updated.id ? updated : l));
    setLogs(updatedLogs);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(updatedLogs));
    setEditLog(null);
    setEditMode(null);
  };

  const closeEdit = () => {
    setEditLog(null);
    setEditMode(null);
  };

  const addLog = (newLog: MealLog) => {
    // Entries from this modal are always reactions → run the reaction analyzer.
    const logToAdd: MealLog = { ...newLog, reactionAnalysisStatus: 'pending' };
    const updated = [logToAdd, ...logs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setLogs(updated);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(updated));
    setShowLogReactionModal(false);
    void analyzeReactionLog(logToAdd, profile?.allergies ?? [], language);
  };

  const runPatternAnalysis = async () => {
    setPatternLoading(true);
    setPatternError(null);
    const result = await analyzePatterns(logs, profile?.allergies ?? [], language);
    if (result.insight) {
      setPatternInsight(result.insight);
    } else {
      setPatternError(result.error ?? 'other');
    }
    setPatternLoading(false);
  };

  // Apply an analysis correction the chat produced, persisting it to the log.
  const applyAnalysisUpdate = (
    id: string,
    update: { mealUpdate?: Partial<MealAnalysis>; reactionUpdate?: Partial<ReactionAnalysis> }
  ) => {
    const now = new Date().toISOString();
    const updated = logs.map((l) => {
      if (l.id !== id) return l;
      if (update.mealUpdate) {
        const base: MealAnalysis = l.analysis ?? { allergens: [], confidence: 'medium', analyzedAt: now };
        return { ...l, analysis: { ...base, ...update.mealUpdate, analyzedAt: now }, analysisStatus: 'done' as const };
      }
      if (update.reactionUpdate) {
        const base: ReactionAnalysis = l.reactionAnalysis ?? {
          assessment: '',
          possibleTriggers: [],
          urgency: 'routine',
          confidence: 'medium',
          analyzedAt: now,
        };
        return {
          ...l,
          reactionAnalysis: { ...base, ...update.reactionUpdate, analyzedAt: now },
          reactionAnalysisStatus: 'done' as const,
        };
      }
      return l;
    });
    setLogs(updated);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(updated));
    const newLog = updated.find((l) => l.id === id) ?? null;
    setChatLog((prev) => (prev && prev.id === id ? newLog : prev));
  };

  const saveAllergies = (newAllergies: string[]) => {
    const updatedProfile = { ...profile!, allergies: newAllergies };
    setProfile(updatedProfile);
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(updatedProfile));
    setShowAllergyModal(false);
  };

  const openMealEdit = (log: MealLog) => {
    setEditLog(log);
    setEditMode('meal');
  };

  const openReactionEdit = (log: MealLog) => {
    setEditLog(log);
    setEditMode('reaction');
  };

  const resetProfile = () => {
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
    localStorage.removeItem(STORAGE_KEYS.LOGS);
    router.replace('/onboarding');
  };

  const reactionCount = logs.filter((l) => l.hasReaction).length;
  const mealCount = logs.filter((l) => !l.hasReaction).length;

  const filteredLogs = useMemo(
    () =>
      selectedDay ? logs.filter((l) => isSameDay(new Date(l.createdAt), selectedDay)) : logs,
    [logs, selectedDay]
  );

  // Meals tab shows meals only; reactions live in the Reactions tab.
  const filteredMeals = useMemo(() => filteredLogs.filter((l) => !l.hasReaction), [filteredLogs]);

  const filteredReactions = useMemo(
    () => filteredLogs.filter((l) => l.hasReaction),
    [filteredLogs]
  );

  const todayLogs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return logs.filter((l) => isSameDay(new Date(l.createdAt), today));
  }, [logs]);

  if (!profile) return null;

  const initials = profile.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen app-bg">
      {showThemeMenu && (
        <div className="fixed inset-0 z-20" onClick={() => setShowThemeMenu(false)} />
      )}

      {showLogReactionModal && (
        <LogReactionModal onSave={addLog} onClose={() => setShowLogReactionModal(false)} />
      )}

      {chatLog && (
        <ChatSheet
          log={chatLog}
          onClose={() => setChatLog(null)}
          onUpdate={(u) => applyAnalysisUpdate(chatLog.id, u)}
        />
      )}

      {showAllergyModal && profile && (
        <EditAllergyModal
          profile={profile}
          onSave={saveAllergies}
          onClose={() => setShowAllergyModal(false)}
        />
      )}
      {editLog && editMode === 'meal' && (
        <EditMealModal log={editLog} onSave={saveEdit} onClose={closeEdit} />
      )}
      {editLog && editMode === 'reaction' && (
        <EditReactionModal log={editLog} onSave={saveEdit} onClose={closeEdit} />
      )}

      {/* Header */}
      <header className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-200/70 dark:border-gray-800/70 sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          {/* Gear menu */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu((v) => !v)}
              className="press w-11 h-11 flex items-center justify-center rounded-2xl bg-gray-100/80 dark:bg-gray-800/80 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              title="Configurações"
            >
              <GearIcon />
            </button>

            {showThemeMenu && (
              <div className="absolute left-0 top-full mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-4 w-52 z-30 animate-scale-in">
                {/* Appearance section */}
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                  {t('settings.appearance')}
                </p>
                <button
                  onClick={() => {
                    toggle();
                    setShowThemeMenu(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <div className="flex items-center gap-2">
                    <span>{theme === 'dark' ? '🌙' : '☀️'}</span>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {theme === 'dark' ? t('settings.darkMode') : t('settings.lightMode')}
                    </span>
                  </div>
                  <div
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                      theme === 'dark' ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                        theme === 'dark' ? 'translate-x-5' : ''
                      }`}
                    />
                  </div>
                </button>

                {/* Language section */}
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                    {t('settings.language')}
                  </p>
                  <div className="flex flex-col gap-1">
                    {(['pt', 'en'] as Language[]).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => {
                          setLanguage(lang);
                          setShowThemeMenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                          language === lang
                            ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <span>{lang === 'pt' ? '🇧🇷 Português' : '🇺🇸 English'}</span>
                        {language === lang && (
                          <span className="text-green-600 dark:text-green-400 text-xs font-bold">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center text-white text-base font-bold flex-shrink-0 shadow-lg shadow-emerald-500/40">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('header.hello')}</p>
              <p className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight truncate">
                {profile.name}
              </p>
            </div>
          </div>

          <button
            onClick={resetProfile}
            className="press text-xs font-medium text-gray-400 hover:text-red-500 px-3 py-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/60 flex-shrink-0"
          >
            {t('header.signOut')}
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-lg mx-auto px-4">
          <div className="flex border-b border-gray-100 dark:border-gray-800">
            {(
              [
                { key: 'inicio', labelKey: 'tab.home' },
                { key: 'refeicoes', labelKey: 'tab.meals' },
                { key: 'reacoes', labelKey: 'tab.reactions' },
              ] as const
            ).map(({ key, labelKey }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 py-3.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  activeTab === key
                    ? 'border-green-600 text-green-600 dark:text-green-400 dark:border-green-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 pb-28">
        {/* ── HOME TAB ── */}
        {activeTab === 'inicio' && (
          <div className="space-y-4 animate-tab">
            {/* Hero greeting */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 p-5 text-white shadow-xl shadow-emerald-500/30 animate-pop-in">
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 animate-float" />
              <div className="absolute -bottom-10 -left-6 w-28 h-28 rounded-full bg-white/10" />
              <div className="relative">
                <p className="text-sm font-medium text-white/80">{t('header.hello')} {profile.name.split(' ')[0]} 👋</p>
                <h1 className="text-2xl font-extrabold tracking-tight mt-1">
                  {todayLogs.filter((l) => !l.hasReaction).length > 0
                    ? `${todayLogs.filter((l) => !l.hasReaction).length} ${t('stats.meals').toLowerCase()} · ${t('home.today').toLowerCase()}`
                    : t('home.today')}
                </h1>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setActiveTab('refeicoes')}
                className="press hover-lift bg-white dark:bg-gray-900/80 rounded-2xl p-4 border border-green-100 dark:border-green-900/50 text-center animate-pop-in shadow-sm"
                style={{ animationDelay: '0s' }}
              >
                <div className="icon-tile w-16 h-16 mx-auto mb-2 bg-gradient-to-br from-emerald-400 to-green-600 text-4xl">🍽️</div>
                <p className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 leading-none">{mealCount}</p>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1.5">{t('stats.meals')}</p>
              </button>
              <button
                onClick={() => setActiveTab('reacoes')}
                className="press hover-lift bg-white dark:bg-gray-900/80 rounded-2xl p-4 border border-red-100 dark:border-red-900/50 text-center animate-pop-in shadow-sm"
                style={{ animationDelay: '0.08s' }}
              >
                <div className="icon-tile w-16 h-16 mx-auto mb-2 bg-gradient-to-br from-red-400 to-orange-500 text-4xl">⚡</div>
                <p className="text-3xl font-extrabold text-red-500 leading-none">{reactionCount}</p>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1.5">{t('stats.reactions')}</p>
              </button>
              <button
                onClick={() => setShowAllergyModal(true)}
                className="press hover-lift bg-white dark:bg-gray-900/80 rounded-2xl p-4 border border-amber-100 dark:border-amber-900/50 text-center animate-pop-in shadow-sm"
                style={{ animationDelay: '0.16s' }}
              >
                <div className="icon-tile w-16 h-16 mx-auto mb-2 bg-gradient-to-br from-amber-400 to-yellow-500 text-4xl">⚠️</div>
                <p className="text-3xl font-extrabold text-amber-600 dark:text-amber-500 leading-none">{profile.allergies.length}</p>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1.5">{t('stats.allergies')}</p>
              </button>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => router.push('/log')}
                className="cta-green press text-white rounded-2xl p-4 flex items-center gap-3 text-left"
              >
                <span className="text-4xl">🍽️</span>
                <span className="font-semibold text-sm leading-tight">{t('meals.logButton')}</span>
              </button>
              <button
                onClick={() => setShowLogReactionModal(true)}
                className="cta-red press text-white rounded-2xl p-4 flex items-center gap-3 text-left"
              >
                <span className="text-4xl">⚡</span>
                <span className="font-semibold text-sm leading-tight">{t('reactions.logButton')}</span>
              </button>
            </div>

            <AIInsightsPanel
              insight={patternInsight}
              loading={patternLoading}
              error={patternError}
              onRun={runPatternAnalysis}
              canRun={logs.length > 0}
              reactionCount={reactionCount}
              t={t}
              language={language}
            />

            <div className="hover-lift bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100">
                  <span className="text-2xl">⚠️</span> {t('home.myAllergies')}
                </h2>
                <button
                  onClick={() => setShowAllergyModal(true)}
                  className="press text-xs text-green-600 hover:text-green-700 font-semibold px-2.5 py-1 rounded-lg bg-green-50 dark:bg-green-950/60"
                >
                  {t('home.edit')}
                </button>
              </div>
              {profile.allergies.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.allergies.map((a) => (
                    <button
                      key={a}
                      onClick={() => setShowAllergyModal(true)}
                      className="press bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm font-medium px-3 py-1.5 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900"
                    >
                      ⚠️ {t('allergy.' + a)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 dark:text-gray-500 text-sm">
                  {t('home.noAllergies')}
                </p>
              )}
            </div>

            <div className="hover-lift bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5">
              <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100 mb-3">
                <span className="text-2xl">📅</span> {t('home.today')}
              </h2>
              {todayLogs.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {t('home.noMealsToday')}
                </p>
              ) : (
                <div className="space-y-1">
                  {todayLogs.map((log, index) => {
                    const mealTypeInfo = log.mealType
                      ? MEAL_TYPES.find((tp) => tp.value === log.mealType)
                      : null;
                    return (
                      <button
                        key={log.id}
                        onClick={() => (log.hasReaction ? openReactionEdit(log) : openMealEdit(log))}
                        className="press w-full flex items-center gap-3 py-2 px-2 -mx-2 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 animate-fade-slide-up"
                        style={{ animationDelay: `${index * 0.04}s` }}
                      >
                        <span className="icon-tile w-12 h-12 bg-gray-100 dark:bg-gray-800 text-2xl flex-shrink-0 shadow-none">
                          {log.hasReaction ? '⚡' : (mealTypeInfo?.icon ?? '🍽️')}
                        </span>
                        <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                          {log.mealName}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                          {getMealTime(log)}
                        </span>
                        <span
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            log.hasReaction ? 'bg-red-500' : 'bg-green-500'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MEALS TAB ── */}
        {activeTab === 'refeicoes' && (
          <div className="space-y-4 animate-tab">
            <DaySelector weekDays={weekDays} selectedDay={selectedDay} onChange={setSelectedDay} />

            {filteredMeals.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-10 text-center animate-pop-in">
                <div className="icon-tile w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-emerald-100 to-green-200 dark:from-emerald-950 dark:to-green-900 text-4xl animate-float">🍽️</div>
                <p className="text-gray-600 dark:text-gray-400 font-medium text-sm">
                  {selectedDay ? t('meals.empty.filtered') : t('meals.empty.all')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredMeals.map((log, index) => (
                  <div
                    key={log.id}
                    className="animate-fade-slide-up"
                    style={{ animationDelay: `${index * 0.04}s` }}
                  >
                    <CompactMealCard
                      log={log}
                      onEdit={() => openMealEdit(log)}
                      onDelete={() => setDeleteId(log.id)}
                      onAsk={() => setChatLog(log)}
                      showDeleteConfirm={deleteId === log.id}
                      onConfirmDelete={() => deleteLog(log.id)}
                      onCancelDelete={() => setDeleteId(null)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── REACTIONS TAB ── */}
        {activeTab === 'reacoes' && (
          <div className="space-y-4 animate-tab">
            <DaySelector weekDays={weekDays} selectedDay={selectedDay} onChange={setSelectedDay} />

            {filteredReactions.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-10 text-center animate-pop-in">
                <div className="icon-tile w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-emerald-100 to-green-200 dark:from-emerald-950 dark:to-green-900 text-4xl animate-float">✅</div>
                <p className="text-gray-600 dark:text-gray-400 font-medium text-sm">
                  {filteredLogs.length > 0
                    ? t('reactions.empty.filtered')
                    : selectedDay
                    ? t('reactions.empty.noMeals')
                    : t('reactions.empty.all')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredReactions.map((log, index) => (
                  <div
                    key={log.id}
                    className="animate-fade-slide-up"
                    style={{ animationDelay: `${index * 0.04}s` }}
                  >
                    <ReactionCard
                      log={log}
                      onEdit={() => openReactionEdit(log)}
                      onDelete={() => setDeleteId(log.id)}
                      onAsk={() => setChatLog(log)}
                      showDeleteConfirm={deleteId === log.id}
                      onConfirmDelete={() => deleteLog(log.id)}
                      onCancelDelete={() => setDeleteId(null)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* FAB */}
      {activeTab !== 'inicio' && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center px-4">
          {activeTab === 'refeicoes' ? (
            <button
              key="fab-meals"
              onClick={() => router.push('/log')}
              className="cta-green press animate-pulse-glow text-white font-bold text-base px-7 py-4 rounded-2xl flex items-center gap-2.5 animate-scale-in"
              style={{ transformOrigin: 'center' }}
            >
              <span className="text-2xl leading-none">＋</span>
              {t('meals.logButton')}
            </button>
          ) : (
            <button
              key="fab-reactions"
              onClick={() => setShowLogReactionModal(true)}
              className="cta-red press animate-pulse-glow text-white font-bold text-base px-7 py-4 rounded-2xl flex items-center gap-2.5 animate-scale-in"
              style={{ transformOrigin: 'center' }}
            >
              <span className="text-2xl leading-none">＋</span>
              {t('reactions.logButton')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
