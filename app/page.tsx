'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from './types';
import { useLanguage } from './components/LanguageProvider';

export default function Home() {
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    const profile = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (profile) {
      router.replace('/dashboard');
    } else {
      router.replace('/onboarding');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center app-bg">
      <div className="text-center animate-pop-in">
        <div className="w-24 h-24 bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 rounded-[2rem] flex items-center justify-center mx-auto mb-5 shadow-xl shadow-emerald-500/40 animate-float animate-pulse-glow">
          <span className="text-5xl">🌿</span>
        </div>
        <h1 className="text-2xl font-extrabold text-gradient mb-1">MyAllergo</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm animate-pulse">{t('loading')}</p>
      </div>
    </div>
  );
}
