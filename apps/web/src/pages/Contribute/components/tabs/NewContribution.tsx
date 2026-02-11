import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, FileJson, X } from 'lucide-react'
import { energyApi, type EnergyProvider, type ContributionData } from '@/api/energy'
import { toast } from '@/stores/notificationStore'
import PowerVariantForm from '../forms/PowerVariantForm'
import ValidityPeriodManager from '../ValidityPeriodManager'
import { type PowerVariant, type ValidityPeriod } from '../../types'
import { formatPrice } from '../../utils'

interface NewContributionProps {
  editingContributionId: string | null
  setEditingContributionId: (id: string | null) => void
  formState: {
    contributionType: 'NEW_PROVIDER' | 'NEW_OFFER'
    providerName: string
    providerWebsite: string
    selectedProviderId: string
    offerName: string
    offerType: string
    description: string
    powerVariants: PowerVariant[]
    priceSheetUrl: string
    screenshotUrl: string
    validityPeriods: ValidityPeriod[]
  }
  onFormStateChange: (key: string, value: unknown) => void
}

export default function NewContribution({ 
  editingContributionId, 
  setEditingContributionId,
  formState,
  onFormStateChange 
}: NewContributionProps) {
  const queryClient = useQueryClient()
  const [showJsonImport, setShowJsonImport] = useState(false)
  const [jsonImportData, setJsonImportData] = useState('')
  const [importProgress, setImportProgress] = useState<{current: number, total: number, errors: string[]} | null>(null)

  // Fetch providers
  const { data: providersData } = useQuery({
    queryKey: ['energy-providers'],
    queryFn: async () => {
      const response = await energyApi.getProviders()
      if (response.success && Array.isArray(response.data)) {
        return response.data as EnergyProvider[]
      }
      return []
    },
  })

  // Submit mutation (create new contribution)
  const submitMutation = useMutation({
    mutationFn: async (data: ContributionData) => {
      return await energyApi.submitContribution(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
      toast.success('Contribution soumise avec succès ! Les administrateurs vont la vérifier.')
      resetForm()
    },
    onError: (error: unknown) => {
      const errorMessage = (error as Error)?.message || 'Une erreur est survenue'
      toast.error(`Erreur: ${errorMessage}`)
    },
  })

  // Update mutation (edit existing contribution)
  const updateMutation = useMutation({
    mutationFn: async ({ contributionId, data }: { contributionId: string; data: ContributionData }) => {
      return await energyApi.updateContribution(contributionId, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
      toast.success('Contribution mise à jour avec succès !')
      resetForm()
      setEditingContributionId(null)
    },
    onError: (error: unknown) => {
      const errorMessage = (error as Error)?.message || 'Une erreur est survenue'
      toast.error(`Erreur: ${errorMessage}`)
    },
  })

  const resetForm = () => {
    onFormStateChange('offerName', '')
    onFormStateChange('offerType', 'BASE')
    onFormStateChange('description', '')
    onFormStateChange('powerVariants', [])
    onFormStateChange('priceSheetUrl', '')
    onFormStateChange('screenshotUrl', '')
    onFormStateChange('providerName', '')
    onFormStateChange('providerWebsite', '')
    onFormStateChange('selectedProviderId', '')
    onFormStateChange('validityPeriods', [
      {
        id: `period-${Date.now()}`,
        validFrom: new Date().toISOString().split('T')[0],
        validTo: '',
      },
    ])
    setEditingContributionId(null)
  }

  const handleAddPowerVariant = (variant: PowerVariant) => {
    onFormStateChange('powerVariants', [...formState.powerVariants, variant])
  }

  const handleRemovePowerVariant = (index: number) => {
    onFormStateChange('powerVariants', formState.powerVariants.filter((_, i) => i !== index))
  }

  /**
   * Vérifie si les périodes se chevauchent
   */
  const hasOverlappingPeriods = (periods: ValidityPeriod[]): boolean => {
    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        const p1 = periods[i]
        const p2 = periods[j]

        if (!p1.validFrom || !p2.validFrom) continue

        const start1 = new Date(p1.validFrom)
        const end1 = p1.validTo ? new Date(p1.validTo) : new Date('9999-12-31')
        const start2 = new Date(p2.validFrom)
        const end2 = p2.validTo ? new Date(p2.validTo) : new Date('9999-12-31')

        if (start1 <= end2 && start2 <= end1) {
          return true
        }
      }
    }
    return false
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation : au moins une variante de puissance
    if (formState.powerVariants.length === 0) {
      toast.error('Veuillez ajouter au moins une variante de puissance')
      return
    }

    // Validation : au moins une période de validité
    if (formState.validityPeriods.length === 0) {
      toast.error('Veuillez ajouter au moins une période de validité')
      return
    }

    // Validation : pas de chevauchement de périodes
    if (hasOverlappingPeriods(formState.validityPeriods)) {
      toast.error('Les périodes de validité ne doivent pas se chevaucher')
      return
    }

    // Mode édition : une seule période autorisée (modification de contribution existante)
    if (editingContributionId) {
      if (formState.validityPeriods.length > 1) {
        toast.error('En mode édition, une seule période est autorisée')
        return
      }

      const period = formState.validityPeriods[0]
      const contributionData: ContributionData = {
        contribution_type: formState.contributionType,
        offer_name: formState.offerName,
        offer_type: formState.offerType,
        description: formState.description || undefined,
        power_variants: formState.powerVariants,
        price_sheet_url: formState.priceSheetUrl,
        screenshot_url: formState.screenshotUrl || undefined,
        valid_from: period.validFrom || new Date().toISOString().split('T')[0],
        ...(period.validTo ? { pricing_data: { valid_to: period.validTo } } : {}),
      }

      if (formState.contributionType === 'NEW_PROVIDER') {
        contributionData.provider_name = formState.providerName
        contributionData.provider_website = formState.providerWebsite || undefined
      } else {
        contributionData.existing_provider_id = formState.selectedProviderId
      }

      updateMutation.mutate({ contributionId: editingContributionId, data: contributionData })
      return
    }

    // Mode création : créer une contribution par période
    const loadingId = toast.loading(`Soumission de ${formState.validityPeriods.length} contribution(s) en cours...`)
    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    try {
      for (const period of formState.validityPeriods) {
        const contributionData: ContributionData = {
          contribution_type: formState.contributionType,
          offer_name: formState.offerName,
          offer_type: formState.offerType,
          description: formState.description || undefined,
          power_variants: formState.powerVariants,
          price_sheet_url: formState.priceSheetUrl,
          screenshot_url: formState.screenshotUrl || undefined,
          valid_from: period.validFrom || new Date().toISOString().split('T')[0],
          ...(period.validTo ? { pricing_data: { valid_to: period.validTo } } : {}),
        }

        if (formState.contributionType === 'NEW_PROVIDER') {
          contributionData.provider_name = formState.providerName
          contributionData.provider_website = formState.providerWebsite || undefined
        } else {
          contributionData.existing_provider_id = formState.selectedProviderId
        }

        try {
          await energyApi.submitContribution(contributionData)
          successCount++
        } catch (error: unknown) {
          errorCount++
          const errorMessage = (error as Error)?.message || 'Erreur inconnue'
          const periodLabel = period.validTo
            ? `${period.validFrom} → ${period.validTo}`
            : `${period.validFrom} → active`
          errors.push(`Période ${periodLabel}: ${errorMessage}`)
        }
      }

      // Invalider le cache des contributions
      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })

      // Afficher le résultat
      toast.dismiss(loadingId)
      if (errorCount === 0) {
        toast.success(`${successCount} contribution(s) soumise(s) avec succès ! Les administrateurs vont les vérifier.`)
        resetForm()
      } else if (successCount > 0) {
        toast.warning(`${successCount} contribution(s) réussie(s), ${errorCount} échec(s). Vérifiez les détails ci-dessous.`)
        if (errors.length > 0) {
          errors.forEach((err) => toast.error(err, { duration: 8000 }))
        }
      } else {
        toast.error(`Toutes les contributions ont échoué. Vérifiez les détails ci-dessous.`)
        if (errors.length > 0) {
          errors.forEach((err) => toast.error(err, { duration: 8000 }))
        }
      }
    } catch (error: unknown) {
      toast.dismiss(loadingId)
      const errorMessage = (error as Error)?.message || 'Une erreur est survenue'
      toast.error(`Erreur globale: ${errorMessage}`)
    }
  }

  const handleJsonImport = async () => {
    try {
      const data = JSON.parse(jsonImportData)

      // Support pour deux formats :
      // 1. Format avec wrapper : { provider_name, data_source, extraction_date, offers: [...] }
      // 2. Format direct : [...] ou {...}
      let contributions: unknown[]
      if (data.offers && Array.isArray(data.offers)) {
        // Format avec wrapper structure
        contributions = data.offers
      } else if (Array.isArray(data)) {
        // Format direct array
        contributions = data
      } else {
        // Format objet unique
        contributions = [data]
      }

      // Validation : détecter l'erreur courante "valid_until" au lieu de "valid_to" dans "pricing_data"
      const invalidContributions = contributions.filter((contrib: any) =>
        contrib.valid_until && (!contrib.pricing_data || !contrib.pricing_data.valid_to)
      )
      if (invalidContributions.length > 0) {
        toast.error(
          `❌ Format incorrect détecté : ${invalidContributions.length} offre(s) utilisent "valid_until" au lieu de "valid_to" dans "pricing_data". Ces offres seront créées comme ACTIVES au lieu d'expirées !`,
          { duration: 10000 }
        )
        return
      }

      setImportProgress({ current: 0, total: contributions.length, errors: [] })
      const errors: string[] = []

      for (let i = 0; i < contributions.length; i++) {
        try {
          await energyApi.submitContribution(contributions[i] as ContributionData)
          setImportProgress({ current: i + 1, total: contributions.length, errors })
        } catch (error: unknown) {
          const offerName = (contributions[i] as any).offer_name || 'Inconnue'
          const errorMessage = (error as Error)?.message || 'Erreur inconnue'
          const errorMsg = `Offre ${i + 1} (${offerName}): ${errorMessage}`
          errors.push(errorMsg)
          setImportProgress({ current: i + 1, total: contributions.length, errors })
        }
      }

      if (errors.length === 0) {
        toast.success(`${contributions.length} contribution(s) importée(s) avec succès !`)
      } else {
        toast.error(`Import terminé avec ${errors.length} erreur(s). Vérifiez les détails ci-dessous.`)
      }

      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })

      if (errors.length === 0) {
        setJsonImportData('')
        setShowJsonImport(false)
      }
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Format JSON invalide'
      toast.error(`Erreur de parsing JSON: ${errorMessage}`)
    }
  }

  return (
    <div id="contribution-form" className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Plus className="text-primary-600 dark:text-primary-400" size={20} />
          {editingContributionId ? 'Modifier la contribution' : 'Nouvelle contribution'}
        </h2>
        <div className="flex items-center gap-4">
          {editingContributionId && (
            <button
              type="button"
              onClick={() => {
                setEditingContributionId(null)
                resetForm()
              }}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Annuler l'édition
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowJsonImport(!showJsonImport)}
            className={`btn flex items-center gap-2 text-sm ${showJsonImport ? 'btn-primary' : 'btn-secondary'}`}
          >
            <FileJson size={16} />
            {showJsonImport ? 'Formulaire' : 'Import JSON'}
          </button>
        </div>
      </div>

      {/* JSON Import Section */}
      {showJsonImport ? (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
            <h3 className="font-semibold mb-2 text-blue-900 dark:text-blue-100">📋 Formats JSON supportés</h3>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
              Le système supporte deux formats d'import. Les offres sont automatiquement triées par date de validité.
            </p>

            {/* Format 1 : Wrapper avec métadonnées (recommandé) */}
            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border border-green-300 dark:border-green-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-mono text-gray-700 dark:text-gray-300">Format 1 : Wrapper avec métadonnées</p>
                <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">Recommandé</span>
              </div>
              <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
{`{
  "provider_name": "EDF",
  "data_source": "https://www.edf.fr/grille-tarifaire.pdf",
  "extraction_date": "2026-02-09",
  "offers": [
    {
      "contribution_type": "NEW_OFFER",
      "existing_provider_id": "uuid-fournisseur",
      "offer_name": "Mon offre (2024)",
      "offer_type": "BASE",
      "valid_from": "2024-01-01",
      "pricing_data": { "valid_to": "2024-12-31" },
      "price_sheet_url": "https://...",
      "power_variants": [
        {
          "power_kva": 6,
          "subscription_price": 13.95,
          "base_price": 18.50
        }
      ]
    }
  ]
}`}
              </pre>
              <p className="text-xs text-green-700 dark:text-green-400 mt-2">
                ✅ <strong>Recommandé</strong> : Ce format permet de tracer la source des données (fournisseur, origine, date d'extraction)
              </p>
            </div>

            {/* Format 2 : Array direct */}
            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border border-blue-300 dark:border-blue-700">
              <p className="text-xs font-mono text-gray-700 dark:text-gray-300 mb-2">Format 2 : Array direct (simple)</p>
              <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
{`[
  {
    "contribution_type": "NEW_OFFER",
    "existing_provider_id": "uuid-fournisseur",
    "offer_name": "Mon offre (2024)",
    "offer_type": "BASE",
    "valid_from": "2024-01-01",
    "pricing_data": { "valid_to": "2024-12-31" },
    "price_sheet_url": "https://...",
    "power_variants": [...]
  }
]`}
              </pre>
            </div>

            {/* Avertissements importants */}
            <div className="mt-3 space-y-2">
              <p className="text-xs text-orange-700 dark:text-orange-400">
                ⚠️ <strong>Important</strong> : Pour les offres expirées, mettez <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">valid_to</code> dans <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">pricing_data</code>, pas à la racine !
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                💡 Les prix doivent être en <strong>centimes</strong> (ex: 18.50 = 1850 centimes)
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Collez votre JSON ici :</label>
            <textarea
              value={jsonImportData}
              onChange={(e) => setJsonImportData(e.target.value)}
              className="input font-mono text-xs"
              rows={15}
              placeholder='[{"contribution_type": "NEW_OFFER", ...}]'
            />
          </div>

          {importProgress && (
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded">
              <div className="mb-2">
                <div className="flex justify-between text-sm mb-1">
                  <span>Progression : {importProgress.current} / {importProgress.total}</span>
                  <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
              {importProgress.errors.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Erreurs :</p>
                  <ul className="text-xs space-y-1 text-red-600 dark:text-red-400">
                    {importProgress.errors.map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleJsonImport}
              className="btn btn-primary"
              disabled={!jsonImportData || importProgress !== null}
            >
              Importer les offres
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Contribution Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Type de contribution</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="NEW_OFFER"
                  checked={formState.contributionType === 'NEW_OFFER'}
                  onChange={(e) => onFormStateChange('contributionType', e.target.value as 'NEW_OFFER')}
                  className="cursor-pointer"
                />
                <span>Nouvelle offre (fournisseur existant)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="NEW_PROVIDER"
                  checked={formState.contributionType === 'NEW_PROVIDER'}
                  onChange={(e) => onFormStateChange('contributionType', e.target.value as 'NEW_PROVIDER')}
                  className="cursor-pointer"
                />
                <span>Nouveau fournisseur + offre</span>
              </label>
            </div>
          </div>

          {/* Provider Selection or Creation */}
          {formState.contributionType === 'NEW_PROVIDER' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nom du fournisseur <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formState.providerName}
                  onChange={(e) => onFormStateChange('providerName', e.target.value)}
                  className="input"
                  required
                  placeholder="Ex: EDF, Engie, Total Energies..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Site web (optionnel)</label>
                <input
                  type="url"
                  value={formState.providerWebsite}
                  onChange={(e) => onFormStateChange('providerWebsite', e.target.value)}
                  className="input"
                  placeholder="https://..."
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Fournisseur <span className="text-red-500">*</span>
              </label>
              <select
                value={formState.selectedProviderId}
                onChange={(e) => onFormStateChange('selectedProviderId', e.target.value)}
                className="input"
                required
              >
                <option value="">Sélectionnez un fournisseur</option>
                {Array.isArray(providersData) && providersData.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Offer Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nom de l'offre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formState.offerName}
                onChange={(e) => onFormStateChange('offerName', e.target.value)}
                className="input"
                required
                placeholder="Ex: Tarif Bleu, Heures Creuses..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Type d'offre <span className="text-red-500">*</span>
              </label>
              <select
                value={formState.offerType}
                onChange={(e) => onFormStateChange('offerType', e.target.value)}
                className="input"
                required
              >
                <option value="BASE">BASE</option>
                <option value="BASE_WEEKEND">BASE Week-end (tarif unique + week-end réduit)</option>
                <option value="HC_HP">Heures Creuses / Heures Pleines</option>
                <option value="HC_NUIT_WEEKEND">HC Nuit & Week-end (23h-6h + week-end)</option>
                <option value="HC_WEEKEND">HC Week-end (HC PDL + week-end)</option>
                <option value="SEASONAL">SEASONAL (Tarifs saisonniers hiver/été)</option>
                <option value="ZEN_FLEX">ZEN FLEX (Éco + Sobriété)</option>
                <option value="TEMPO">TEMPO</option>
                <option value="EJP">EJP</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description (optionnelle)</label>
            <textarea
              value={formState.description}
              onChange={(e) => onFormStateChange('description', e.target.value)}
              className="input"
              rows={3}
              placeholder="Décrivez brièvement cette offre..."
            />
          </div>

          {/* Power Variants */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Variantes de puissance</h3>
              <span className="text-xs font-semibold px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                ⚠️ PRIX TTC UNIQUEMENT
              </span>
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                💡 Ajoutez une ou plusieurs puissances avec leurs prix d'abonnement et prix kWh respectifs.
              </p>
            </div>

            <PowerVariantForm
              offerType={formState.offerType}
              onAddVariant={handleAddPowerVariant}
              existingPowers={formState.powerVariants.map(v => v.power_kva)}
            />

            {formState.powerVariants.length > 0 && (
              <div className="mt-6 space-y-3">
                <h4 className="font-semibold text-sm text-gray-900 dark:text-white">Variantes ajoutées ({formState.powerVariants.length})</h4>
                {formState.powerVariants.map((variant, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-semibold text-primary-600 dark:text-primary-400">{variant.power_kva} kVA</span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">•</span>
                        <span className="text-sm">Abo: {variant.subscription_price}€/mois</span>
                      </div>
                      {variant.pricing_data && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                          {variant.pricing_data.base_price && <span>Base: {formatPrice(variant.pricing_data.base_price)}</span>}
                          {variant.pricing_data.hc_price && <span>HC: {formatPrice(variant.pricing_data.hc_price)}</span>}
                          {variant.pricing_data.hp_price && <span>HP: {formatPrice(variant.pricing_data.hp_price)}</span>}
                          {variant.pricing_data.tempo_blue_hc && (
                            <span className="text-blue-600 dark:text-blue-400">
                              Bleu: {formatPrice(variant.pricing_data.tempo_blue_hc)}/{formatPrice(variant.pricing_data.tempo_blue_hp!)}
                            </span>
                          )}
                          {variant.pricing_data.tempo_white_hc && (
                            <span>
                              Blanc: {formatPrice(variant.pricing_data.tempo_white_hc)}/{formatPrice(variant.pricing_data.tempo_white_hp!)}
                            </span>
                          )}
                          {variant.pricing_data.tempo_red_hc && (
                            <span className="text-red-600 dark:text-red-400">
                              Rouge: {formatPrice(variant.pricing_data.tempo_red_hc)}/{formatPrice(variant.pricing_data.tempo_red_hp!)}
                            </span>
                          )}
                          {variant.pricing_data.ejp_normal && <span>Normal: {formatPrice(variant.pricing_data.ejp_normal)}</span>}
                          {variant.pricing_data.ejp_peak && <span className="text-orange-600 dark:text-orange-400">Pointe: {formatPrice(variant.pricing_data.ejp_peak)}</span>}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePowerVariant(index)}
                      className="ml-4 p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Supprimer"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Documentation (Required) */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Documentation <span className="text-red-500">*</span></h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Pour valider votre contribution, nous avons besoin d'une source officielle du fournisseur.
            </p>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Lien vers la fiche des prix <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={formState.priceSheetUrl}
                  onChange={(e) => onFormStateChange('priceSheetUrl', e.target.value)}
                  className="input"
                  required
                  placeholder="https://particulier.edf.fr/tarif-bleu/..."
                />
                <p className="text-xs text-gray-500 mt-1">URL officielle du fournisseur présentant les tarifs</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Screenshot ou PDF (optionnel)
                </label>
                <input
                  type="url"
                  value={formState.screenshotUrl}
                  onChange={(e) => onFormStateChange('screenshotUrl', e.target.value)}
                  className="input"
                  placeholder="https://imgur.com/... ou lien direct vers un screenshot"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Hébergez votre capture d'écran sur Imgur, Dropbox, Google Drive, ou tout autre service et collez le lien direct
                </p>
              </div>
            </div>
          </div>

          {/* Periods de validité */}
          <ValidityPeriodManager
            periods={formState.validityPeriods}
            onAdd={(period) => {
              onFormStateChange('validityPeriods', [...formState.validityPeriods, period])
            }}
            onRemove={(id) => {
              onFormStateChange('validityPeriods', formState.validityPeriods.filter((p) => p.id !== id))
            }}
            onUpdate={(id, field, value) => {
              onFormStateChange(
                'validityPeriods',
                formState.validityPeriods.map((p) => (p.id === id ? { ...p, [field]: value } : p))
              )
            }}
          />

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={resetForm}
              className="btn"
              disabled={submitMutation.isPending}
            >
              Réinitialiser
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitMutation.isPending || updateMutation.isPending}
            >
              {(submitMutation.isPending || updateMutation.isPending)
                ? 'Envoi en cours...'
                : editingContributionId
                  ? 'Mettre à jour la contribution'
                  : 'Soumettre la contribution'
              }
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
