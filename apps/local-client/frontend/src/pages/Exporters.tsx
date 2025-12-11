import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getExporters, testExporter, reloadExporters } from '../api/client'
import Card from '../components/Card'
import { RefreshCw, Play, CheckCircle, XCircle, AlertCircle, Info, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { useState } from 'react'

export default function Exporters() {
  const queryClient = useQueryClient()
  const [testingExporter, setTestingExporter] = useState<string | null>(null)

  const { data: exporters, isLoading } = useQuery({
    queryKey: ['exporters'],
    queryFn: getExporters,
    refetchInterval: 30000, // Refresh every 30s
  })

  const reloadMutation = useMutation({
    mutationFn: reloadExporters,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['exporters'] })
      const messages = []
      if (data.added.length > 0) {
        messages.push(`${data.added.length} ajouté(s)`)
      }
      if (data.removed.length > 0) {
        messages.push(`${data.removed.length} supprimé(s)`)
      }
      if (data.reloaded.length > 0) {
        messages.push(`${data.reloaded.length} rechargé(s)`)
      }
      toast.success(messages.length > 0 ? messages.join(', ') : 'Exporters rechargés')
    },
    onError: () => {
      toast.error('Erreur lors du rechargement des exporters')
    },
  })

  const handleTest = async (name: string) => {
    setTestingExporter(name)
    try {
      const result = await testExporter(name)
      if (result.success) {
        toast.success(`Test réussi : ${name}`)
      } else {
        toast.error(`Test échoué : ${result.error || 'Erreur inconnue'}`)
      }
    } catch (error) {
      toast.error('Erreur lors du test')
    } finally {
      setTestingExporter(null)
    }
  }

  const getStatusIcon = (status: string, enabled: boolean) => {
    if (!enabled) {
      return <AlertCircle className="w-5 h-5 text-gray-400" />
    }
    switch (status) {
      case 'ok':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return <AlertCircle className="w-5 h-5 text-orange-500" />
    }
  }

  const getStatusColor = (status: string, enabled: boolean) => {
    if (!enabled) {
      return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    }
    switch (status) {
      case 'ok':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      default:
        return 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
    }
  }

  return (
    <div className="space-y-6 pt-6">
      {/* Reload button */}
      <div className="flex justify-end">
        <button
          onClick={() => reloadMutation.mutate()}
          disabled={reloadMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${reloadMutation.isPending ? 'animate-spin' : ''}`} />
          Recharger les exporteurs
        </button>
      </div>

      {/* Info banner */}
      <Card className="!p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900 dark:text-blue-100">
            <p className="font-medium mb-1">À propos des exporteurs</p>
            <p>
              Les exporteurs permettent d'envoyer automatiquement vos données de consommation vers des systèmes
              tiers (Home Assistant, Jeedom, MQTT, VictoriaMetrics, etc.). Activez ceux dont vous avez besoin
              via la configuration.
            </p>
          </div>
        </div>
      </Card>

      {/* Stats */}
      {exporters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="!p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {exporters.length}
            </p>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Actifs</p>
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {exporters.filter((e) => e.enabled && e.status === 'ok').length}
            </p>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <p className="text-sm text-gray-500 dark:text-gray-400">En erreur</p>
            </div>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {exporters.filter((e) => e.enabled && e.status === 'error').length}
            </p>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Désactivés</p>
            </div>
            <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
              {exporters.filter((e) => !e.enabled).length}
            </p>
          </Card>
        </div>
      )}

      {/* Exporters list */}
      <Card
        title="Liste des exporteurs"
        subtitle={exporters ? `${exporters.length} exporteur(s) disponible(s)` : undefined}
        icon={<Package className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
      >
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse h-32 bg-gray-100 dark:bg-gray-700 rounded-lg" />
            ))}
          </div>
        ) : exporters && exporters.length > 0 ? (
          <div className="space-y-4">
            {exporters.map((exporter) => (
              <div
                key={exporter.name}
                className={`p-4 rounded-lg border transition-colors ${getStatusColor(
                  exporter.status,
                  exporter.enabled
                )}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(exporter.status, exporter.enabled)}
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {exporter.name}
                      </h3>
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          exporter.enabled
                            ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {exporter.enabled ? 'Activé' : 'Désactivé'}
                      </span>
                    </div>

                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                      {exporter.description}
                    </p>

                    <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Version:</span>
                        <span>{exporter.version}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Auteur:</span>
                        <span>{exporter.author}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Statut:</span>
                        <span className="capitalize">{exporter.status}</span>
                      </div>
                    </div>

                    {exporter.last_error && (
                      <div className="mt-3 p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                        <p className="text-sm text-red-700 dark:text-red-300 font-medium mb-1">
                          Dernière erreur :
                        </p>
                        <p className="text-sm text-red-600 dark:text-red-400 font-mono">
                          {exporter.last_error}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleTest(exporter.name)}
                      disabled={testingExporter === exporter.name || !exporter.enabled}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm whitespace-nowrap"
                    >
                      {testingExporter === exporter.name ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Test...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Tester
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              Aucun exporteur trouvé
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Les exporteurs sont chargés depuis le dossier /exporters
            </p>
          </div>
        )}
      </Card>

      {/* Configuration hint */}
      <Card
        title="Configuration"
        icon={<Info className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
      >
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>
            Pour activer ou configurer un exporteur, modifiez le fichier de configuration correspondant dans le
            dossier <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">/config</code>.
          </p>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="font-medium mb-2">Exemple pour Home Assistant :</p>
            <pre className="text-xs overflow-x-auto">
              {`[homeassistant]
enabled = true
url = http://homeassistant.local:8123
token = your_long_lived_access_token`}
            </pre>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Après modification, utilisez le bouton "Recharger les exporteurs" pour appliquer les changements sans
            redémarrer l'application.
          </p>
        </div>
      </Card>
    </div>
  )
}
