// Sélecteur de type d'offre : grille de boutons avec compteurs + popup info + purge admin
// Affiche tous les types en mode édition, seulement les existants en lecture

import { Plus, Copy, Info, Trash2, X } from 'lucide-react'
import { energyApi } from '@/api/energy'
import { toast } from '@/stores/notificationStore'
import { TYPE_LABELS } from '../../types'
import type { AllOffersState } from '../../hooks/useAllOffersState'

// Ordre de tri des types d'offres
const typeOrder = ['BASE', 'HC_HP', 'TEMPO', 'EJP', 'SEASONAL', 'BASE_WEEKEND', 'HC_NUIT_WEEKEND', 'HC_WEEKEND']

interface OfferTypeSelectorProps {
  state: AllOffersState
}

export default function OfferTypeSelector({ state }: OfferTypeSelectorProps) {
  const {
    sortedProviders,
    activeOffersArray,
    offersArray,
    filterProvider,
    filterOfferType, setFilterOfferType,
    availableOfferTypes,
    isEditMode,
    showTypeInfoPopup, setShowTypeInfoPopup,
    typeInfoTarget, setTypeInfoTarget,
    isPrivilegedUser,
    queryClient,
    setEditedOffers,
    setDeprecatedOffers,
    setUnchangedOfferIds,
    setNewGroups,
    setNewPowersData,
    setPowersToRemove,
    newGroups, setNewGroups: _setNewGroups,
    dynamicPriceFields,
    confirmOrExecute,
    copyJsonToClipboard,
    buildOfferExportJson,
  } = state

  // Purge des offres d'un fournisseur (admin uniquement)
  const handlePurgeProvider = async () => {
    const providerOffers = offersArray.filter(o => o.provider_id === filterProvider)
    const providerName = sortedProviders.find(p => p.id === filterProvider)?.name || ''
    if (providerOffers.length === 0) return
    if (!confirm(`Supprimer définitivement toutes les offres de ${providerName} (${providerOffers.length} offres) ?\n\nCette action est irréversible.`)) return
    try {
      const loadingId = toast.loading(`Suppression des offres de ${providerName}...`)
      const response = await energyApi.purgeProviderOffers(providerName)
      toast.dismiss(loadingId)
      if (response.success) {
        toast.success(`${response.data?.deleted_count || providerOffers.length} offre(s) supprimée(s)`)
        setEditedOffers({})
        setDeprecatedOffers([])
        setUnchangedOfferIds(new Set())
        setNewGroups([])
        setNewPowersData([])
        setPowersToRemove([])
        await queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
      } else {
        toast.error(`Erreur : ${response.error?.message || 'suppression échouée'}`)
      }
    } catch (e) {
      toast.error(`Erreur : ${e instanceof Error ? e.message : 'suppression échouée'}`)
    }
  }

  return (
    <div>
      <div className="mb-3">
        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 text-center">Types d'offre</label>
        <div className="mt-1 h-0.5 w-full bg-primary-500 rounded-full" />
      </div>
      <div className="flex items-center justify-between mb-3">
        {isEditMode && isPrivilegedUser && (() => {
          const providerOffers = offersArray.filter(o => o.provider_id === filterProvider)
          if (providerOffers.length === 0) return null
          const providerName = sortedProviders.find(p => p.id === filterProvider)?.name || ''
          return (
            <button
              onClick={handlePurgeProvider}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50"
              title={`Supprimer définitivement toutes les offres de ${providerName}`}
            >
              <Trash2 size={14} />
              Supprimer toutes les offres du fournisseur
            </button>
          )
        })()}
      </div>

      {/* Grille des types d'offres */}
      {(isEditMode ? typeOrder.length > 0 : availableOfferTypes.length > 0) && (
        <div className="flex flex-wrap justify-center gap-2">
          {(isEditMode ? typeOrder : availableOfferTypes).map((type) => {
            const isSelected = filterOfferType === type
            const typeCount = activeOffersArray.filter(o => o.provider_id === filterProvider && o.offer_type === type).length
            const isEmpty = typeCount === 0
            return (
              <div
                key={type}
                onClick={() => {
                  if (type === filterOfferType) return
                  confirmOrExecute(() => {
                    setFilterOfferType(type)
                    if (isEditMode && isEmpty) {
                      if (newGroups.length === 0) {
                        _setNewGroups([{ name: '', validFrom: new Date().toISOString().split('T')[0], validTo: '', powers: [{ power: 0, fields: {} }] }])
                      }
                    }
                  })
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between gap-2 cursor-pointer flex-1 min-w-[calc((100%-0.5rem)/2)] sm:min-w-[calc((100%-1.5rem)/4)] ${
                  isSelected
                    ? 'bg-primary-600 text-white shadow-md'
                    : isEmpty && isEditMode
                      ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-500 dark:hover:text-primary-400'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                }`}
                title={isEmpty && isEditMode ? `Cliquer pour créer des offres ${TYPE_LABELS[type] || type}` : undefined}
              >
                <span className={`px-1.5 py-0.5 text-xs rounded-full shrink-0 ${
                    isSelected
                      ? 'bg-primary-500 text-white'
                      : isEmpty
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                  }`}>
                    {typeCount}
                </span>
                <span className="flex-1 text-center flex items-center justify-center gap-1.5">
                  {isEmpty && isEditMode && <Plus size={12} className="shrink-0" />}
                  {TYPE_LABELS[type] || type}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setTypeInfoTarget(type)
                      setShowTypeInfoPopup(true)
                    }}
                    className={`p-1 rounded transition-all ${
                      isSelected
                        ? 'text-white/70 hover:text-white hover:bg-white/20'
                        : 'text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                    title="Détail du type d'offre"
                  >
                    <Info size={14} />
                  </button>
                  {!isEmpty && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const currentProv = sortedProviders.find(p => p.id === filterProvider)
                        if (!currentProv) return
                        const typeOffers = offersArray.filter(o => o.provider_id === filterProvider && o.offer_type === type && o.is_active !== false)
                        const exportData = buildOfferExportJson(typeOffers, currentProv.name)
                        copyJsonToClipboard(exportData, `${typeCount} offre(s) ${TYPE_LABELS[type] || type} copiées`)
                      }}
                      className={`p-1 rounded transition-all ${
                        isSelected
                          ? 'text-white/70 hover:text-white hover:bg-white/20'
                          : 'text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                      title={`Copier les offres ${TYPE_LABELS[type] || type} en JSON`}
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Popup d'information sur le type d'offre */}
      {showTypeInfoPopup && typeInfoTarget && (
        <TypeInfoPopup
          type={typeInfoTarget}
          dynamicPriceFields={dynamicPriceFields}
          onClose={() => setShowTypeInfoPopup(false)}
        />
      )}
    </div>
  )
}

// --- Popup d'information sur un type d'offre ---

function TypeInfoPopup({
  type,
  dynamicPriceFields,
  onClose,
}: {
  type: string
  dynamicPriceFields: { label: string }[]
  onClose: () => void
}) {
  const titles: Record<string, string> = {
    BASE: 'Offre Base — Tarif unique',
    HC_HP: 'Offre Heures Creuses / Heures Pleines',
    TEMPO: 'Offre Tempo — 6 tarifs selon le jour',
    EJP: 'Offre EJP — Effacement Jour de Pointe',
    BASE_WEEKEND: 'Offre Base Week-end',
    SEASONAL: 'Offre Saisonnière (2 saisons)',
    HC_WEEKEND: 'Offre HC Week-end',
    HC_NUIT_WEEKEND: 'Offre HC Nuit Week-end',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative max-w-lg w-full p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Info size={20} className="text-primary-600 dark:text-primary-400 shrink-0" />
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
              {titles[type] || `Offre ${type}`}
            </h4>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
          <TypeInfoContent type={type} dynamicPriceFields={dynamicPriceFields} />
        </div>
      </div>
    </div>
  )
}

function TypeInfoContent({ type, dynamicPriceFields }: { type: string; dynamicPriceFields: { label: string }[] }) {
  switch (type) {
    case 'BASE':
      return (
        <>
          <p>Un seul prix du kWh, 24h/24, 7j/7, toute l'année.</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <strong>Tarifs à renseigner :</strong> Abonnement (€/mois) + Prix Base (€/kWh)
          </p>
        </>
      )
    case 'HC_HP':
      return (
        <>
          <p>Deux prix différents selon l'heure :</p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li><strong>Heures Creuses (HC)</strong> : 8h par jour (souvent la nuit entre 22h et 6h, parfois le midi). Prix réduit.</li>
            <li><strong>Heures Pleines (HP)</strong> : les 16h restantes. Prix plus élevé.</li>
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <strong>Tarifs à renseigner :</strong> Abonnement (€/mois) + Prix HC (€/kWh) + Prix HP (€/kWh)
          </p>
        </>
      )
    case 'TEMPO':
      return (
        <>
          <p>L'année est divisée en 3 types de jours, chacun avec ses tarifs HC/HP :</p>
          <ul className="list-none ml-2 space-y-1">
            <li><span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-2"></span><strong>Jours Bleus</strong> (300 jours/an) : tarif le plus avantageux</li>
            <li><span className="inline-block w-3 h-3 rounded-full bg-gray-400 mr-2"></span><strong>Jours Blancs</strong> (43 jours/an) : tarif intermédiaire</li>
            <li><span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2"></span><strong>Jours Rouges</strong> (22 jours/an) : tarif très élevé (hiver uniquement)</li>
          </ul>
          <p className="mt-1">La couleur du lendemain est annoncée la veille à 17h.</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <strong>Tarifs à renseigner :</strong> Abonnement + 6 prix (Bleu HC, Bleu HP, Blanc HC, Blanc HP, Rouge HC, Rouge HP)
          </p>
        </>
      )
    case 'EJP':
      return (
        <>
          <p>Offre historique (non commercialisée depuis 1998) avec 2 périodes :</p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li><strong>Jours Normaux</strong> (345 jours/an) : tarif avantageux</li>
            <li><strong>Jours de Pointe</strong> (20 jours/an, hiver) : tarif très élevé. Prévenus la veille à 17h.</li>
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <strong>Tarifs à renseigner :</strong> Abonnement + Prix Normal (€/kWh) + Prix Pointe (€/kWh)
          </p>
        </>
      )
    case 'BASE_WEEKEND':
      return (
        <>
          <p>Tarif réduit pendant tout le week-end (samedi et dimanche), tarif normal en semaine.</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <strong>Tarifs à renseigner :</strong> Abonnement + Prix Semaine (€/kWh) + Prix Week-end (€/kWh)
          </p>
        </>
      )
    case 'SEASONAL':
      return (
        <>
          <p>Tarification saisonnière avec 2 périodes et des prix HC/HP différents :</p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li><span className="text-orange-600 dark:text-orange-400 font-semibold">Saison basse / Éco</span> : été (avril-octobre) ou jours Éco (345 jours/an) selon le fournisseur — tarifs HC/HP avantageux</li>
            <li><span className="text-blue-600 dark:text-blue-400 font-semibold">Saison haute / Sobriété</span> : hiver (novembre-mars) ou jours Sobriété (20 jours/an) selon le fournisseur — tarifs HC/HP plus élevés</li>
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <strong>Tarifs à renseigner :</strong> Abonnement + HC Été/Éco + HP Été/Éco + HC Hiver/Sobriété + HP Hiver/Sobriété (€/kWh)
          </p>
        </>
      )
    case 'HC_WEEKEND':
    case 'HC_NUIT_WEEKEND':
      return (
        <>
          <p>Tarifs HC/HP avec avantage week-end :</p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li><strong>Semaine</strong> : tarifs HC/HP classiques</li>
            <li><span className="text-green-600 dark:text-green-400 font-semibold">Week-end</span> : tarifs HC/HP réduits (samedi et dimanche)</li>
            {type === 'HC_NUIT_WEEKEND' && <li><strong>Nuit</strong> : heures creuses étendues la nuit</li>}
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <strong>Tarifs à renseigner :</strong> Abonnement + HC Semaine + HP Semaine + HC Week-end + HP Week-end
          </p>
        </>
      )
    default:
      return (
        <>
          <p>Offre avec tarification spécifique détectée depuis les offres existantes.</p>
          {dynamicPriceFields.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <strong>Tarifs à renseigner :</strong> Abonnement (€/mois) + {dynamicPriceFields.map(f => f.label).join(' + ')} (€/kWh)
            </p>
          )}
        </>
      )
  }
}
