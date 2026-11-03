import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Share2 } from 'lucide-react'
import { syncApi, type SharedPdlChoice } from '@/api/sync'
import { toast } from '@/stores/notificationStore'

/**
 * Mode client (MED-112) : choix, PDL par PDL, des PDL que des utilisateurs partagent avec l'admin.
 *
 * Coché : le PDL est créé dans le client et synchronisé au nom de son propriétaire (quota de
 * l'admin). Décoché : le PDL et ses mesures locales sont supprimés. Un compte non admin à la
 * passerelle (403) ne voit pas le panneau.
 */
export default function SharedPdlsPanel() {
  const queryClient = useQueryClient()
  const { data, error, isLoading } = useQuery({
    queryKey: ['shared-pdls-choices'],
    queryFn: async () => (await syncApi.listSharedPdls()).data ?? [],
    retry: false,
    staleTime: 60_000,
  })

  const toggle = useMutation({
    mutationFn: (choice: SharedPdlChoice) =>
      choice.selected
        ? syncApi.unselectSharedPdl(choice.usage_point_id)
        : syncApi.selectSharedPdl(choice.usage_point_id),
    onSuccess: (_res, choice) => {
      toast.success(
        choice.selected
          ? `PDL ${choice.usage_point_id} retiré, données locales supprimées`
          : `PDL ${choice.usage_point_id} ajouté, synchronisation lancée`
      )
      queryClient.invalidateQueries({ queryKey: ['shared-pdls-choices'] })
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
    },
    onError: (err, choice) => {
      const detail = isAxiosError(err) ? err.response?.data?.detail : undefined
      toast.error(`PDL ${choice.usage_point_id} : ${detail ?? 'action impossible'}`)
    },
  })

  // Décocher purge le PDL et toutes ses mesures locales : on demande avant, cocher reste direct.
  const onToggle = (choice: SharedPdlChoice) => {
    if (
      choice.selected &&
      !window.confirm(
        `Retirer le PDL ${choice.usage_point_id} ? Ses données locales (mesures comprises) seront supprimées.`
      )
    ) {
      return
    }
    toggle.mutate(choice)
  }

  if (isLoading) return null
  // Compte non admin à la passerelle : rien à proposer
  if (isAxiosError(error) && error.response?.status === 403) return null

  const choices = (data ?? []).filter((c) => !c.own)
  if (!error && choices.length === 0) return null

  return (
    <section className="card p-4 space-y-3" aria-label="PDL partagés">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
        <Share2 size={16} />
        PDL partagés avec vous ({choices.length})
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Cochez un PDL pour le synchroniser dans ce client. Ses appels comptent sur votre quota ;
        le décocher supprime ses données locales, comme le retrait du partage par son propriétaire.
      </p>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">Liste des PDL partagés indisponible.</p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {choices.map((choice) => (
            <li key={choice.usage_point_id} className="py-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={choice.selected}
                  disabled={toggle.isPending}
                  onChange={() => onToggle(choice)}
                  aria-label={`Synchroniser le PDL ${choice.usage_point_id}`}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {choice.name || choice.usage_point_id}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {choice.usage_point_id} · {choice.owner_email ?? 'propriétaire inconnu'}
                    {choice.has_production ? ' · production' : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
