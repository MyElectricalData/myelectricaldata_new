import { Plus, X, AlertTriangle } from 'lucide-react'
import { SingleDatePicker } from '@/components/SingleDatePicker'
import { type ValidityPeriod } from '../types'

interface ValidityPeriodManagerProps {
  periods: ValidityPeriod[]
  onAdd: (period: ValidityPeriod) => void
  onRemove: (id: string) => void
  onUpdate: (id: string, field: 'validFrom' | 'validTo', value: string) => void
}

/**
 * Vérifie si deux périodes se chevauchent
 */
function periodsOverlap(p1: ValidityPeriod, p2: ValidityPeriod): boolean {
  // Si une des périodes n'a pas de date de début, on ne peut pas vérifier
  if (!p1.validFrom || !p2.validFrom) return false

  const start1 = new Date(p1.validFrom)
  const end1 = p1.validTo ? new Date(p1.validTo) : new Date('9999-12-31')
  const start2 = new Date(p2.validFrom)
  const end2 = p2.validTo ? new Date(p2.validTo) : new Date('9999-12-31')

  // Chevauchement si : start1 <= end2 ET start2 <= end1
  return start1 <= end2 && start2 <= end1
}

/**
 * Détecte les périodes qui se chevauchent
 */
function findOverlappingPeriods(periods: ValidityPeriod[]): string[] {
  const overlappingIds: string[] = []

  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      if (periodsOverlap(periods[i], periods[j])) {
        if (!overlappingIds.includes(periods[i].id)) {
          overlappingIds.push(periods[i].id)
        }
        if (!overlappingIds.includes(periods[j].id)) {
          overlappingIds.push(periods[j].id)
        }
      }
    }
  }

  return overlappingIds
}

export default function ValidityPeriodManager({
  periods,
  onAdd,
  onRemove,
  onUpdate,
}: ValidityPeriodManagerProps) {
  const overlappingIds = findOverlappingPeriods(periods)

  const handleAddPeriod = () => {
    // Générer un ID unique basé sur le timestamp
    const newPeriod: ValidityPeriod = {
      id: `period-${Date.now()}`,
      validFrom: new Date().toISOString().split('T')[0],
      validTo: '',
    }
    onAdd(newPeriod)
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Périodes de validité
        </h3>
        <button
          type="button"
          onClick={handleAddPeriod}
          className="btn btn-secondary btn-sm flex items-center gap-2"
        >
          <Plus size={16} />
          Ajouter une période
        </button>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg mb-4">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          💡 <strong>Créer une offre par période :</strong> Si une offre a connu plusieurs grilles tarifaires dans le temps
          (ex: tarifs 2024, puis nouveaux tarifs 2025), ajoutez une période pour chaque changement.
          Une contribution distincte sera créée pour chaque période.
        </p>
      </div>

      {overlappingIds.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg mb-4 flex items-start gap-3">
          <AlertTriangle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
              Périodes qui se chevauchent détectées
            </p>
            <p className="text-xs text-red-700 dark:text-red-300">
              Les périodes ne doivent pas se chevaucher. Vérifiez les dates de début et de fin.
            </p>
          </div>
        </div>
      )}

      {periods.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">
            Aucune période ajoutée. Cliquez sur "Ajouter une période" pour commencer.
          </p>
          <p className="text-xs mt-2">
            Par défaut, une période active (sans date de fin) sera créée.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {periods.map((period) => {
            const hasOverlap = overlappingIds.includes(period.id)
            const isActivePeriod = !period.validTo

            return (
              <div
                key={period.id}
                className={`p-4 rounded-lg border-2 ${
                  hasOverlap
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    {isActivePeriod && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        Offre active
                      </span>
                    )}
                    {hasOverlap && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                        Chevauchement détecté
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(period.id)}
                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title="Supprimer cette période"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <SingleDatePicker
                      value={period.validFrom}
                      onChange={(date) => onUpdate(period.id, 'validFrom', date)}
                      label="Date de début"
                      required
                      minDate="2020-01-01"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Date d'entrée en vigueur de cette grille tarifaire
                    </p>
                  </div>
                  <div>
                    <SingleDatePicker
                      value={period.validTo}
                      onChange={(date) => onUpdate(period.id, 'validTo', date)}
                      label="Date de fin"
                      minDate={period.validFrom || '2020-01-01'}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Laissez vide si c'est l'offre actuellement active
                    </p>
                    {period.validTo && (
                      <button
                        type="button"
                        onClick={() => onUpdate(period.id, 'validTo', '')}
                        className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Marquer comme période active (effacer date de fin)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {periods.length > 0 && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <strong>Résumé :</strong> {periods.length} période{periods.length > 1 ? 's' : ''} configurée{periods.length > 1 ? 's' : ''}.
            {periods.length > 1 && ` ${periods.length} contributions seront créées (une par période).`}
            {overlappingIds.length > 0 && (
              <span className="text-red-600 dark:text-red-400 ml-1">
                {overlappingIds.length} période{overlappingIds.length > 1 ? 's' : ''} en chevauchement.
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
