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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-emerald-50 to-teal-100 dark:from-gray-950 dark:via-gray-900 dark:to-emerald-950">
      <div className="text-center animate-pop-in">
        <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg animate-float animate-pulse-glow">
          <span className="text-4xl">🌿</span>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm animate-pulse">{t('loading')}</p>
      </div>
    </div>
  );
}
