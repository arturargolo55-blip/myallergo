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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="text-center">
        <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-3xl">🌿</span>
        </div>
        <p className="text-gray-500 text-sm animate-pulse">{t('loading')}</p>
      </div>
    </div>
  );
}
