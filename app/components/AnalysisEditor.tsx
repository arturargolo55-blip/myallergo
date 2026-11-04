'use client';

import { useMemo, useState } from 'react';
import { AllergenMatch, AnalyzedIngredient, CalorieRange, MealAnalysis } from '../types';
import { crossCheckAllergens, computeRiskLevel, CUSTOM_PREFIX } from '../lib/allergens';
import { applyCalorieSanity } from '../lib/analysis';
import { useLanguage } from './LanguageProvider';
import { TFunction } from '../i18n/translations';

function allergenLabel(id: string, t: TFunction): string {
  return id.startsWith(CUSTOM_PREFIX) ? id.slice(CUSTOM_PREFIX.length) : t('allergen.' + id);
}

/**
 * On-demand editor for a meal's analysis (the former review screen). Editable
 * ingredients WITH amounts, allergen add/remove, macros, calories/range.
 * On save, detectedAllergens + riskLevel are recomputed in code (lib/allergens)
 * and userEdited is set true — the corrected version is the source of truth.
 */
export function AnalysisEditor({
  analysis,
  userAllergies,
  onSave,
  onClose,
}: {
  analysis: MealAnalysis;
  userAllergies: string[];
  onSave: (a: MealAnalysis) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();

  const [ings, setIngs] = useState<AnalyzedIngredient[]>(analysis.ingredients ?? []);
  const [newIng, setNewIng] = useState('');
  const [cal, setCal] = useState(analysis.calories != null ? String(analysis.calories) : '');
  const [protein, setProtein] = useState(analysis.macros ? String(analysis.macros.protein_g) : '');
  const [carbs, setCarbs] = useState(analysis.macros ? String(analysis.macros.carbs_g) : '');
  const [fat, setFat] = useState(analysis.macros ? String(analysis.macros.fat_g) : '');
  const [suppressed, setSuppressed] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<Set<string>>(new Set());
  // % of added cooking fat that stays in the pan (shown only when the model assumed one).
  const [panPct, setPanPct] = useState(
    analysis.absorbedFraction != null ? String(Math.round((1 - analysis.absorbedFraction) * 100)) : ''
  );

  // Code-computed allergen matches recompute live as ingredients change.
  const liveMatches = useMemo(() => crossCheckAllergens(ings, userAllergies), [ings, userAllergies]);
  const autoIds = useMemo(() => [...new Set(liveMatches.map((m) => m.allergenId))], [liveMatches]);
  const finalIds = useMemo(() => {
    const s = new Set<string>();
    autoIds.forEach((id) => !suppressed.has(id) && s.add(id));
    extra.forEach((id) => s.add(id));
    return [...s];
  }, [autoIds, suppressed, extra]);

  const finalMatches: AllergenMatch[] = finalIds.map(
    (id) =>
      liveMatches.find((m) => m.allergenId === id) ?? {
        allergenId: id,
        matchedTerm: '(manual)',
        ingredient: '(manual)',
        strength: 'match' as const,
      }
  );
  const risk = computeRiskLevel(finalMatches);
  const addable = userAllergies.filter((id) => !finalIds.includes(id));

  const setIng = (i: number, patch: Partial<AnalyzedIngredient>) =>
    setIngs((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeIng = (i: number) => setIngs((prev) => prev.filter((_, idx) => idx !== i));
  const addIngredient = () => {
    const name = newIng.trim();
    if (!name) return;
    // Added by hand in the editor = the user stated it.
    setIngs((prev) => [...prev, { name, confidence: 'stated' }]);
    setNewIng('');
  };
  const toggleSuppress = (id: string) =>
    setSuppressed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = () => {
    const macros = protein || carbs || fat
      ? { protein_g: Number(protein) || 0, carbs_g: Number(carbs) || 0, fat_g: Number(fat) || 0 }
      : undefined;
    const estimate = cal ? Number(cal) : undefined;
    let calorieRange: CalorieRange | undefined = analysis.calorieRange;
    if (calorieRange && estimate != null) {
      calorieRange = {
        min: Math.min(calorieRange.min, estimate),
        estimate,
        max: Math.max(calorieRange.max, estimate),
        reason: calorieRange.reason,
      };
    }
    const absorbedFraction =
      panPct !== '' ? Math.min(1, Math.max(0, 1 - Number(panPct) / 100)) : analysis.absorbedFraction;
    // Re-run the code sanity-check against the edited amounts/assumption.
    onSave(
      applyCalorieSanity({
        ...analysis,
        ingredients: ings,
        calories: estimate,
        calorieRange,
        macros,
        absorbedFraction,
        calorieNote: undefined, // recomputed by applyCalorieSanity
        detectedAllergens: finalMatches,
        riskLevel: risk,
        userEdited: true,
      })
    );
  };

  const riskStyle =
    risk === 'detected'
      ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
      : risk === 'possible'
      ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
      : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 animate-fade-in overflow-y-auto" onClick={onClose}>
      <div
        className="relative min-h-full max-w-lg mx-auto bg-white dark:bg-gray-900 sm:my-6 sm:min-h-0 sm:rounded-3xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('editor.title')}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 text-xl leading-none">
            ×
          </button>
        </div>

        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${riskStyle}`}>{t('risk.' + risk)}</span>

        {/* Detected allergens (code-generated) */}
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('review.detected')}</p>
          {finalIds.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('review.noAllergens')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {finalIds.map((id) => (
                <span key={id} className="flex items-center gap-1 text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                  ⚠️ {allergenLabel(id, t)}
                  <button
                    onClick={() =>
                      autoIds.includes(id)
                        ? toggleSuppress(id)
                        : setExtra((p) => {
                            const n = new Set(p);
                            n.delete(id);
                            return n;
                          })
                    }
                    className="hover:text-red-500 ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {addable.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {addable.map((id) => (
                <button key={id} onClick={() => setExtra((p) => new Set(p).add(id))} className="press text-xs border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full hover:border-amber-400">
                  + {allergenLabel(id, t)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ingredients with amounts */}
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('review.ingredients')}</p>
          <div className="space-y-1.5">
            {ings.map((ing, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  value={ing.name}
                  onChange={(e) => setIng(i, { name: e.target.value })}
                  className="flex-1 min-w-0 px-2.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <input
                  type="number"
                  value={ing.amount ?? ''}
                  onChange={(e) => setIng(i, { amount: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder={t('editor.amt')}
                  className="w-14 px-2 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <input
                  value={ing.unit ?? ''}
                  onChange={(e) => setIng(i, { unit: e.target.value || undefined })}
                  placeholder={t('editor.unit')}
                  className="w-16 px-2 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button onClick={() => removeIng(i)} className="text-gray-300 hover:text-red-400 px-1 flex-shrink-0">×</button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                value={newIng}
                onChange={(e) => setNewIng(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addIngredient()}
                placeholder={t('review.addIngredient')}
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button onClick={addIngredient} disabled={!newIng.trim()} className="press px-3 py-2 bg-gray-100 dark:bg-gray-800 text-sm rounded-xl disabled:opacity-40">
                +
              </button>
            </div>
          </div>
        </div>

        {/* Macros + calories (with range hint) */}
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {t('review.macros')} {analysis.macrosAreEstimate && <span className="text-xs font-normal text-gray-400">· {t('review.estimate')}</span>}
          </p>
          {analysis.calorieRange && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              {t('review.range')}: ~{analysis.calorieRange.min}–{analysis.calorieRange.max} {t('ai.kcal')}
            </p>
          )}
          {analysis.calorieNote === 'range_widened' && (
            <p className="text-xs text-amber-600 dark:text-amber-500 mb-2">{t('review.rangeWidened')}</p>
          )}
          {panPct !== '' && (
            <div className="mb-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{t('editor.panStart')}</span>
              <input
                type="number"
                value={panPct}
                onChange={(e) => setPanPct(e.target.value)}
                className="w-14 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <span>{t('editor.panEnd')}</span>
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {([['review.kcal', cal, setCal], ['review.protein', protein, setProtein], ['review.carbs', carbs, setCarbs], ['review.fat', fat, setFat]] as const).map(
              ([labelKey, val, setter]) => (
                <label key={labelKey} className="text-xs text-gray-500 dark:text-gray-400">
                  {t(labelKey)}
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </label>
              )
            )}
          </div>
        </div>

        <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">{t('ai.hiddenNote')}</p>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            {t('modal.cancel')}
          </button>
          <button onClick={save} className="cta-green press flex-1 py-3 rounded-xl text-white text-sm font-semibold">
            {t('modal.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
