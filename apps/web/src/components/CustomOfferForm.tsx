import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilLine, Save, Trash2, X } from 'lucide-react'
import { energyApi, CUSTOM_PROVIDER_ID, type CustomOfferData, type EnergyOffer } from '@/api/energy'
import { offersWithHistoryQueryOptions } from '@/api/energyQueries'
import { toast } from '@/stores/notificationStore'

interface CustomOfferFormProps {
  selectedOfferId: string | null | undefined
  subscribedPower: number | null | undefined
  // Sélectionne l'offre sur le PDL (null pour la retirer)
  onSelect: (offerId: string | null) => void
  disabled?: boolean
}

interface FormState {
  name: string
  offer_type: 'BASE' | 'HC_HP'
  power_kva: string
  subscription_price: string
  base_price: string
  hc_price: string
  hp_price: string
}

// L'API renvoie les montants au format de la base (« 18.36000 ») : affichés « 18,36 »
const toText = (value: number | string | null | undefined) =>
  value == null || value === '' || Number.isNaN(Number(value)) ? '' : String(Number(value)).replace('.', ',')

// Accepte la virgule décimale (« 0,1885 »)
const toNumber = (value: string): number | null => {
  const parsed = Number(value.trim().replace(',', '.'))
  return value.trim() === '' || Number.isNaN(parsed) ? null : parsed
}

const initialState = (offer: EnergyOffer | undefined, subscribedPower: number | null | undefined): FormState => ({
  name: offer?.name ?? 'Mon offre',
  offer_type: offer?.offer_type === 'BASE' ? 'BASE' : 'HC_HP',
  power_kva: toText(offer?.power_kva ?? subscribedPower),
  subscription_price: toText(offer?.subscription_price),
  base_price: toText(offer?.base_price),
  hc_price: toText(offer?.hc_price),
  hp_price: toText(offer?.hp_price),
})

/**
 * Offre aux prix saisis à la main (mode client).
 *
 * Pour un contrat absent de la base des offres (grille souscrite avant la grille actuelle…) :
 * l'utilisateur saisit son abonnement et ses prix du kWh, l'offre est créée puis sélectionnée sur le PDL.
 */
export default function CustomOfferForm({ selectedOfferId, subscribedPower, onSelect, disabled = false }: CustomOfferFormProps) {
  const queryClient = useQueryClient()
  const { data: offers } = useQuery(offersWithHistoryQueryOptions())
  const selectedCustomOffer = offers?.find((o) => o.id === selectedOfferId && o.provider_id === CUSTOM_PROVIDER_ID)

  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState<FormState>(() => initialState(selectedCustomOffer, subscribedPower))

  const refreshOffers = () => {
    queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
    queryClient.invalidateQueries({ queryKey: ['energy-providers'] })
  }

  const saveMutation = useMutation({
    mutationFn: async (data: CustomOfferData) => {
      const response = selectedCustomOffer
        ? await energyApi.updateCustomOffer(selectedCustomOffer.id, data)
        : await energyApi.createCustomOffer(data)
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || "Impossible d'enregistrer l'offre")
      }
      return response.data
    },
    onSuccess: (offer) => {
      refreshOffers()
      if (offer.id !== selectedOfferId) onSelect(offer.id)
      setIsOpen(false)
      toast.success('Prix enregistrés')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const response = await energyApi.deleteCustomOffer(offerId)
      if (!response.success) throw new Error(response.error?.message || "Impossible de supprimer l'offre")
    },
    onSuccess: () => {
      refreshOffers()
      // L'API retire déjà l'offre des PDL : on rafraîchit la carte
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
      setIsOpen(false)
      toast.success('Offre supprimée')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const open = () => {
    setForm(initialState(selectedCustomOffer, subscribedPower))
    setIsOpen(true)
  }

  const update = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const subscription = toNumber(form.subscription_price)
  const prices =
    form.offer_type === 'BASE'
      ? { base_price: toNumber(form.base_price) }
      : { hc_price: toNumber(form.hc_price), hp_price: toNumber(form.hp_price) }
  const isValid =
    form.name.trim() !== '' &&
    subscription !== null &&
    subscription >= 0 &&
    Object.values(prices).every((p) => p !== null && p > 0)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || subscription === null) return
    saveMutation.mutate({
      name: form.name.trim(),
      offer_type: form.offer_type,
      power_kva: toNumber(form.power_kva),
      subscription_price: subscription,
      ...prices,
    })
  }

  const isBusy = disabled || saveMutation.isPending || deleteMutation.isPending

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={open}
        disabled={isBusy}
        className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50"
      >
        <PencilLine size={14} />
        {selectedCustomOffer ? 'Modifier mes prix' : 'Mon offre n’est pas dans la liste : saisir mes prix'}
      </button>
    )
  }

  const priceInput = (field: keyof FormState, label: string, unit: string, placeholder = '0,0000') => (
    <label className="block text-sm">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={form[field]}
          onChange={update(field)}
          placeholder={placeholder}
          className="input py-1.5"
          required
        />
        <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">{unit}</span>
      </div>
    </label>
  )

  return (
    <form
      onSubmit={submit}
      className="space-y-3 p-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
    >
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Prix TTC de votre contrat (facture ou grille tarifaire). L’offre est enregistrée sur cette installation et
        utilisée pour les coûts en euros, le simulateur et les exports.
      </p>

      <label className="block text-sm">
        <span className="text-gray-600 dark:text-gray-400">Nom de l’offre</span>
        <input type="text" value={form.name} onChange={update('name')} maxLength={255} className="input py-1.5 mt-1" required />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-gray-600 dark:text-gray-400">Option tarifaire</span>
          <select value={form.offer_type} onChange={update('offer_type')} className="input py-1.5 mt-1">
            <option value="HC_HP">Heures Creuses / Pleines</option>
            <option value="BASE">Base</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600 dark:text-gray-400">Puissance souscrite</span>
          <select value={form.power_kva} onChange={update('power_kva')} className="input py-1.5 mt-1">
            <option value="">Toutes</option>
            {[3, 6, 9, 12, 15, 18, 24, 30, 36].map((kva) => (
              <option key={kva} value={kva}>
                {kva} kVA
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {priceInput('subscription_price', 'Abonnement', '€/mois', '0,00')}
        {form.offer_type === 'BASE' && priceInput('base_price', 'Prix du kWh', '€/kWh')}
      </div>
      {form.offer_type === 'HC_HP' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {priceInput('hc_price', 'Prix du kWh en heures creuses', '€/kWh')}
          {priceInput('hp_price', 'Prix du kWh en heures pleines', '€/kWh')}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={isBusy || !isValid} className="btn btn-primary flex items-center gap-2 py-1.5">
          <Save size={16} />
          Enregistrer
        </button>
        <button type="button" onClick={() => setIsOpen(false)} disabled={isBusy} className="btn btn-secondary flex items-center gap-2 py-1.5">
          <X size={16} />
          Annuler
        </button>
        {selectedCustomOffer && (
          <button
            type="button"
            onClick={() => deleteMutation.mutate(selectedCustomOffer.id)}
            disabled={isBusy}
            className="ml-auto flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
          >
            <Trash2 size={14} />
            Supprimer cette offre
          </button>
        )}
      </div>
    </form>
  )
}
