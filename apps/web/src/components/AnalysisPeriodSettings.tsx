import { useId } from 'react'
import { Calendar } from 'lucide-react'
import { useAppMode } from '@/hooks/useAppMode'
import {
  useDatePreferencesStore,
  getDateRangeFromPreset,
  DATE_PRESET_LABELS,
  DATE_PRESET_DESCRIPTIONS,
  MONTH_LABELS,
  maxDayOfMonth,
  type DatePreset
} from '@/stores/datePreferencesStore'

const PRESETS: DatePreset[] = ['tempo', 'rolling', 'calendar', 'custom']

const formatDisplayDate = (dateStr: string) => {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

/**
 * Choix de la période d'analyse (année Tempo, glissante, calendaire ou date personnalisée).
 * Partagé entre la page « Mon compte » (mode serveur) et la page « Préférences » (mode client).
 */
export default function AnalysisPeriodSettings() {
  const { preset, customDate, setPreset, setCustomDate } = useDatePreferencesStore()
  const { start, end } = getDateRangeFromPreset(preset, customDate)
  const { isServerMode } = useAppMode()
  const dayId = useId()
  const monthId = useId()

  return (
    <div className="card border-teal-200 dark:border-teal-800">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="text-teal-600 dark:text-teal-400" size={24} />
        <h2 className="text-xl font-semibold">Période d'analyse</h2>
      </div>
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Choisissez la période de référence des cartes et de la courbe annuelles de la page Consommation (kWh).
        </p>

        {/* Preset Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PRESETS.map((presetKey) => (
            <button
              key={presetKey}
              type="button"
              aria-pressed={preset === presetKey}
              onClick={() => setPreset(presetKey)}
              className={`p-4 rounded-lg border-2 transition-colors text-left ${
                preset === presetKey
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-700'
              }`}
            >
              <div className="font-medium text-sm mb-1">{DATE_PRESET_LABELS[presetKey]}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {DATE_PRESET_DESCRIPTIONS[presetKey]}
              </div>
            </button>
          ))}
        </div>

        {/* Custom Date Selection - Only visible when custom preset is selected */}
        {preset === 'custom' && (
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Date de début personnalisée :
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor={dayId} className="text-sm text-gray-600 dark:text-gray-400">Jour :</label>
                <select
                  id={dayId}
                  value={customDate.day}
                  onChange={(e) => setCustomDate({ ...customDate, day: parseInt(e.target.value) })}
                  className="input w-20"
                >
                  {Array.from({ length: maxDayOfMonth(customDate.month) }, (_, i) => i + 1).map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor={monthId} className="text-sm text-gray-600 dark:text-gray-400">Mois :</label>
                <select
                  id={monthId}
                  value={customDate.month}
                  onChange={(e) => setCustomDate({ ...customDate, month: parseInt(e.target.value) })}
                  className="input w-40"
                >
                  {MONTH_LABELS.map((label, index) => (
                    <option key={index + 1} value={index + 1}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Preview of current selection */}
        <div className="p-4 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg">
          <p className="text-sm text-teal-800 dark:text-teal-200 mb-2">
            <strong>Aperçu de la plage actuelle :</strong>
          </p>
          <p className="text-sm text-teal-700 dark:text-teal-300 mb-3">
            Du <span className="font-semibold">{formatDisplayDate(start)}</span> au{' '}
            <span className="font-semibold">{formatDisplayDate(end)}</span>
          </p>
          {/* Le simulateur n'existe qu'en mode serveur */}
          {isServerMode && preset === 'tempo' && (
            <p className="text-xs text-teal-600 dark:text-teal-400 border-t border-teal-200 dark:border-teal-700 pt-3">
              💡 <strong>Période recommandée pour le simulateur</strong> : l'Année Tempo (1er septembre → 31 août) est idéale pour comparer les offres tarifaires, car elle correspond à la saison Tempo complète avec ses 22 jours Rouge. Cela permet une comparaison précise des offres EJP, Tempo et autres tarifs saisonniers.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
