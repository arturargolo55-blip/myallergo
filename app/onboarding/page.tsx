'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { COMMON_ALLERGIES, STORAGE_KEYS, UserProfile } from '../types';
import { useLanguage } from '../components/LanguageProvider';

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [customAllergy, setCustomAllergy] = useState('');
  const [customAllergies, setCustomAllergies] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState('');

  const handleNameNext = () => {
    if (!name.trim()) {
      setError(t('onboarding.name.error'));
      return;
    }
    setError('');
    setStep(2);
  };

  const toggleAllergy = (allergy: string) => {
    setSelectedAllergies((prev) =>
      prev.includes(allergy) ? prev.filter((a) => a !== allergy) : [...prev, allergy]
    );
  };

  const addCustomAllergy = () => {
    const trimmed = customAllergy.trim();
    if (!trimmed) return;
    if (!customAllergies.includes(trimmed) && !selectedAllergies.includes(trimmed)) {
      setCustomAllergies((prev) => [...prev, trimmed]);
      setSelectedAllergies((prev) => [...prev, trimmed]);
    }
    setCustomAllergy('');
  };

  const removeCustomAllergy = (allergy: string) => {
    setCustomAllergies((prev) => prev.filter((a) => a !== allergy));
    setSelectedAllergies((prev) => prev.filter((a) => a !== allergy));
  };

  const handleFinish = () => {
    const profile: UserProfile = {
      name: name.trim(),
      allergies: selectedAllergies,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    router.replace('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-100 dark:from-gray-950 dark:via-gray-900 dark:to-emerald-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-slide-up">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg animate-float animate-pulse-glow">
            <span className="text-4xl">🌿</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Allergy Tracker</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1.5">{t('onboarding.subtitle')}</p>
        </div>

        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-3xl shadow-xl shadow-green-900/5 border border-gray-100 dark:border-gray-800 p-6">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className={`flex-1 h-1.5 rounded-full transition-colors duration-500 ${step >= 1 ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
            <div className={`flex-1 h-1.5 rounded-full transition-colors duration-500 ${step >= 2 ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
          </div>

          {step === 1 && (
            <div className="animate-fade-slide-up">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">{t('onboarding.step1.title')}</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{t('onboarding.step1.subtitle')}</p>

              <div className="mb-4">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('onboarding.name.label')}
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleNameNext()}
                  placeholder={t('onboarding.name.placeholder')}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  autoFocus
                />
                {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
              </div>

              <button
                onClick={handleNameNext}
                className="cta-green press w-full text-white font-semibold py-3.5 px-4 rounded-xl"
              >
                {t('onboarding.next')}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-slide-up">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
                {t('onboarding.step2.title')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">
                {t('onboarding.step2.subtitle')}
              </p>

              {/* Common allergies grid */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                {COMMON_ALLERGIES.map((allergy) => {
                  const selected = selectedAllergies.includes(allergy);
                  return (
                    <button
                      key={allergy}
                      onClick={() => toggleAllergy(allergy)}
                      className={`press flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-colors
                        ${selected
                          ? 'bg-green-50 dark:bg-green-950 border-green-500 dark:border-green-600 text-green-700 dark:text-green-300'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                    >
                      <span className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-xs transition-colors
                        ${selected ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                        {selected && '✓'}
                      </span>
                      {t('allergy.' + allergy)}
                    </button>
                  );
                })}
              </div>

              {/* Custom allergies */}
              {customAllergies.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {customAllergies.map((a) => (
                    <span key={a} className="flex items-center gap-1 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-xs font-medium px-2.5 py-1 rounded-full">
                      {a}
                      <button onClick={() => removeCustomAllergy(a)} className="hover:text-red-500 ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add custom allergy */}
              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  value={customAllergy}
                  onChange={(e) => setCustomAllergy(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomAllergy()}
                  placeholder={t('onboarding.allergy.placeholder')}
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <button
                  onClick={addCustomAllergy}
                  disabled={!customAllergy.trim()}
                  className="press px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl"
                >
                  {t('onboarding.allergy.add')}
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="press flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold py-3.5 px-4 rounded-xl"
                >
                  {t('onboarding.back')}
                </button>
                <button
                  onClick={handleFinish}
                  className="cta-green press flex-1 text-white font-semibold py-3.5 px-4 rounded-xl"
                >
                  {t('onboarding.start')}
                </button>
              </div>

              {selectedAllergies.length === 0 && (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-3">
                  {t('onboarding.noAllergies')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
