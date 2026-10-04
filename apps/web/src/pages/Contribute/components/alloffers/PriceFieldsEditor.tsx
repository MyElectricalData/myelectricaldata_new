// Champs de prix dynamiques par type d'offre — élimine la duplication 8x dans AllOffers.tsx
// Utilisé par : OfferRow (existantes), NewGroupForm (nouveaux groupes), NewPowerRow (nouvelles puissances)

import { getPriceFieldsConfig, getLabelColor, hasSeasonalLayout, SEASONAL_LAYOUT } from '../../utils/offerPricing'
import type { PriceFieldConfig } from '../../types'

interface PriceFieldsEditorProps {
  offerType: string
  fields: Record<string, string>
  onChange: (key: string, value: string) => void
  // Mode compact : labels empilés (pour Tempo, Seasonal...)
  compact?: boolean
  readOnly?: boolean
  // Surligner les champs modifiés
  isModified?: (key: string) => boolean
  // Champs dynamiques (pour types non standard)
  dynamicFields?: PriceFieldConfig[]
  // Unité affichée (défaut: €/kWh)
  unit?: string
}

export default function PriceFieldsEditor({
  offerType,
  fields,
  onChange,
  compact = false,
  readOnly = false,
  isModified,
  dynamicFields,
  unit = '€/kWh',
}: PriceFieldsEditorProps) {
  const config = getPriceFieldsConfig(offerType, dynamicFields)
  const seasonal = hasSeasonalLayout(offerType) ? SEASONAL_LAYOUT[offerType] : null

  // Layout saisonnier : regroupement par saison (2 lignes)
  if (seasonal) {
    return (
      <div className="flex flex-col gap-1 flex-1">
        {seasonal.map(group => (
          <div key={group.label} className="flex items-center gap-2">
            <span className={`text-xs font-semibold w-14 shrink-0 text-right ${group.color}`}>{group.label}</span>
            <div className="flex gap-3 flex-1">
              {group.fields.map(fieldKey => {
                const fieldConfig = config.find(f => f.key === fieldKey)
                if (!fieldConfig) return null
                return (
                  <PriceField
                    key={fieldKey}
                    fieldKey={fieldKey}
                    label={fieldConfig.label}
                    color={fieldConfig.color}
                    value={fields[fieldKey] || ''}
                    onChange={(v) => onChange(fieldKey, v)}
                    compact={compact}
                    readOnly={readOnly}
                    modified={isModified?.(fieldKey) ?? false}
                    unit={unit}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Layout standard : tous les champs sur une ligne
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 flex-1">
      {config.map(field => (
        <PriceField
          key={field.key}
          fieldKey={field.key}
          label={field.label}
          color={field.color}
          value={fields[field.key] || ''}
          onChange={(v) => onChange(field.key, v)}
          compact={compact}
          readOnly={readOnly}
          modified={isModified?.(field.key) ?? false}
          unit={unit}
        />
      ))}
    </div>
  )
}

// --- Sous-composant : un champ de prix individuel ---

interface PriceFieldProps {
  fieldKey: string
  label: string
  color?: string
  value: string
  onChange: (value: string) => void
  compact: boolean
  readOnly: boolean
  modified: boolean
  unit: string
}

function PriceField({ label, color, value, onChange, compact, readOnly, modified, unit }: PriceFieldProps) {
  const labelColor = color || getLabelColor(label)

  // Mode compact : label au-dessus de la valeur
  if (compact) {
    if (readOnly) {
      return (
        <div className="flex-1 flex flex-col items-center min-w-0">
          <span className={`text-xs font-semibold ${labelColor}`}>{label}</span>
          <span className="text-sm font-bold text-gray-900 dark:text-white">
            {value || '-'}
          </span>
        </div>
      )
    }
    return (
      <div className="flex-1 flex flex-col items-center min-w-0 gap-0.5">
        <span className={`text-xs font-semibold ${labelColor}`}>{label}</span>
        <input
          type="number"
          step="0.0001"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full min-w-[60px] max-w-[100px] px-2 py-1 text-sm font-bold text-center border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none ${
            modified
              ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
              : 'border-gray-300 dark:border-gray-600'
          }`}
        />
      </div>
    )
  }

  // Mode standard : label et valeur en ligne
  if (readOnly) {
    return (
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span className={`text-sm font-semibold w-10 shrink-0 text-right ${labelColor}`}>{label}</span>
        <span className="text-base font-bold text-gray-900 dark:text-white truncate">
          {value || '-'}
        </span>
        <span className="text-gray-500 dark:text-gray-400 text-xs shrink-0">{unit}</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center gap-2 min-w-0">
      <span className={`text-sm font-semibold w-10 shrink-0 text-right ${labelColor}`}>{label}</span>
      <input
        type="number"
        step="0.0001"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`flex-1 min-w-[80px] max-w-[120px] px-3 py-2 text-base font-bold border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none ${
          modified
            ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      />
      <span className="text-gray-500 dark:text-gray-400 text-sm shrink-0">{unit}</span>
    </div>
  )
}
