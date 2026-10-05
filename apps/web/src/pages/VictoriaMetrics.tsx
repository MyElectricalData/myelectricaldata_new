/**
 * VictoriaMetrics Export Page (Client Mode Only)
 *
 * Dedicated page for configuring VictoriaMetrics time-series database export.
 * Sends electricity consumption/production data via InfluxDB line protocol.
 */

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/stores/notificationStore'
import {
  exportApi,
  ExportConfig,
  ExportConfigCreate,
  VictoriaMetricsConfig,
  ExportMetricsData,
} from '@/api/export'
import {
  Database,
  Save,
  TestTube,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  CheckCircle,
  Clock,
  Play,
  Settings,
  Server,
  Lock,
  Tag,
} from 'lucide-react'
import MetricsSection from '@/components/MetricsSection'

export default function VictoriaMetrics() {
  const queryClient = useQueryClient()

  // State
  const [isEditing, setIsEditing] = useState(false)
  const [testingConfig, setTestingConfig] = useState(false)
  const [metricsData, setMetricsData] = useState<ExportMetricsData | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)

  // Form state
  const [formEnabled, setFormEnabled] = useState(true)
  const [formConsumption, setFormConsumption] = useState(true)
  const [formProduction, setFormProduction] = useState(true)
  const [formDetailed, setFormDetailed] = useState(false)
  const [formIntervalMinutes, setFormIntervalMinutes] = useState<number | null>(30)

  // VictoriaMetrics config
  const [vmUrl, setVmUrl] = useState('')
  const [vmDatabase, setVmDatabase] = useState('myelectricaldata')
  const [vmUsername, setVmUsername] = useState('')
  const [vmPassword, setVmPassword] = useState('')

  // Query existing config
  const { data: configsResponse, isLoading } = useQuery({
    queryKey: ['export-configs'],
    queryFn: () => exportApi.listConfigs(),
  })

  // Find existing VictoriaMetrics config
  const existingConfig = configsResponse?.data?.configs?.find(
    (c) => c.export_type === 'victoriametrics'
  )

  // Load existing config into form
  useEffect(() => {
    if (existingConfig) {
      loadConfigIntoForm(existingConfig)
    }
  }, [existingConfig?.id])

  const loadConfigIntoForm = async (config: ExportConfig) => {
    try {
      const response = await exportApi.getConfig(config.id)
      const fullConfig = response.data
      if (!fullConfig) return

      setFormEnabled(fullConfig.is_enabled)
      setFormConsumption(fullConfig.export_consumption)
      setFormProduction(fullConfig.export_production)
      setFormDetailed(fullConfig.export_detailed)
      setFormIntervalMinutes(fullConfig.export_interval_minutes ?? null)

      const cfg = fullConfig.config as VictoriaMetricsConfig
      if (cfg) {
        setVmUrl(cfg.url || '')
        setVmDatabase(cfg.database || 'myelectricaldata')
        setVmUsername(cfg.username || '')
        setVmPassword(cfg.password || '')
      }
    } catch {
      toast.error('Erreur lors du chargement de la configuration')
    }
  }

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      const config: VictoriaMetricsConfig = {
        url: vmUrl,
        database: vmDatabase,
        username: vmUsername || undefined,
        password: vmPassword || undefined,
      }

      if (existingConfig) {
        return exportApi.updateConfig(existingConfig.id, {
          config,
          is_enabled: formEnabled,
          export_consumption: formConsumption,
          export_production: formProduction,
          export_detailed: formDetailed,
          export_interval_minutes: formIntervalMinutes,
        })
      } else {
        const createData: ExportConfigCreate = {
          name: 'VictoriaMetrics',
          export_type: 'victoriametrics',
          config,
          is_enabled: formEnabled,
          export_consumption: formConsumption,
          export_production: formProduction,
          export_detailed: formDetailed,
          export_interval_minutes: formIntervalMinutes,
        }
        return exportApi.createConfig(createData)
      }
    },
    onSuccess: () => {
      toast.success('Configuration sauvegardée')
      queryClient.invalidateQueries({ queryKey: ['export-configs'] })
      setIsEditing(false)
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`)
    },
  })

  const testMutation = useMutation({
    mutationFn: (id: string) => exportApi.testConfig(id),
    onSuccess: (response) => {
      setTestingConfig(false)
      if (response.data?.success) {
        toast.success('Connexion réussie !')
      } else {
        toast.error(response.data?.message || 'Erreur de connexion')
      }
    },
    onError: (error: Error) => {
      setTestingConfig(false)
      toast.error(`Erreur de test: ${error.message}`)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      exportApi.updateConfig(id, { is_enabled: enabled }),
    onSuccess: (_, { enabled }) => {
      toast.success(enabled ? 'Export activé' : 'Export désactivé')
      queryClient.invalidateQueries({ queryKey: ['export-configs'] })
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`)
    },
  })

  const runMutation = useMutation({
    mutationFn: (id: string) => exportApi.runExport(id),
    onSuccess: () => {
      toast.success('Export lancé')
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`)
    },
  })

  // Load metrics
  const loadMetrics = async () => {
    if (!existingConfig) return

    setMetricsLoading(true)
    setMetricsData(null)

    try {
      const response = await exportApi.readMetrics(existingConfig.id)
      setMetricsData(response.data ?? null)
    } catch (err) {
      toast.error('Erreur lors de la lecture des métriques')
      setMetricsData({
        success: false,
        message: 'Erreur de connexion',
        metrics: [],
        errors: [String(err)],
      })
    } finally {
      setMetricsLoading(false)
    }
  }

  const handleSubmit = () => {
    if (!vmUrl.trim()) {
      toast.error('Veuillez saisir l\'URL de VictoriaMetrics')
      return
    }
    saveMutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="pt-6 w-full">
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-primary-600 dark:text-primary-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="pt-6 w-full">
      {/* Info Box */}
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>VictoriaMetrics</strong> est une base de données time-series compatible InfluxDB.
          Les données sont envoyées via le protocole InfluxDB line protocol sur l'endpoint <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">/write</code>.
          Vous pouvez ensuite les visualiser dans Grafana.
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-300 dark:border-gray-700 p-6">
        {/* Status Header */}
        {existingConfig && !isEditing && (
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-4">
              <button
                onClick={() => toggleMutation.mutate({ id: existingConfig.id, enabled: !existingConfig.is_enabled })}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  existingConfig.is_enabled
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                {existingConfig.is_enabled ? (
                  <>
                    <ToggleRight size={20} /> Activé
                  </>
                ) : (
                  <>
                    <ToggleLeft size={20} /> Désactivé
                  </>
                )}
              </button>

              {existingConfig.last_export_at && (
                <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                  <Clock size={14} />
                  Dernier export: {new Date(existingConfig.last_export_at).toLocaleString('fr-FR')}
                  {existingConfig.last_export_status === 'success' && (
                    <CheckCircle size={14} className="text-green-500" />
                  )}
                  {existingConfig.last_export_status === 'failed' && (
                    <AlertCircle size={14} className="text-red-500" />
                  )}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setTestingConfig(true)
                  testMutation.mutate(existingConfig.id)
                }}
                disabled={testingConfig}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
              >
                {testingConfig ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <TestTube size={16} />
                )}
                Tester
              </button>
              <button
                onClick={() => runMutation.mutate(existingConfig.id)}
                disabled={!existingConfig.is_enabled}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play size={16} /> Exécuter
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <Settings size={16} /> Configurer
              </button>
            </div>
          </div>
        )}

        {/* Configuration Form */}
        {(isEditing || !existingConfig) && (
          <div className="space-y-6">
            {/* Connection Settings */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Server size={20} className="text-primary-600 dark:text-primary-400" />
                Connexion VictoriaMetrics
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    URL VictoriaMetrics *
                  </label>
                  <input
                    type="url"
                    value={vmUrl}
                    onChange={(e) => setVmUrl(e.target.value)}
                    placeholder="http://victoriametrics:8428"
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    URL de l'instance VictoriaMetrics (ex: http://localhost:8428)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Base de données
                  </label>
                  <input
                    type="text"
                    value={vmDatabase}
                    onChange={(e) => setVmDatabase(e.target.value)}
                    placeholder="myelectricaldata"
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Nom de la base (utilisé comme préfixe de tag)
                  </p>
                </div>
              </div>
            </div>

            {/* Authentication (Optional) */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Lock size={20} className="text-primary-600 dark:text-primary-400" />
                Authentification (optionnel)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Utilisateur
                  </label>
                  <input
                    type="text"
                    value={vmUsername}
                    onChange={(e) => setVmUsername(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    value={vmPassword}
                    onChange={(e) => setVmPassword(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Requis uniquement si VictoriaMetrics est configuré avec authentification Basic Auth
              </p>
            </div>

            {/* Data Options */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Tag size={20} className="text-primary-600 dark:text-primary-400" />
                Données à exporter
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="export-consumption"
                    checked={formConsumption}
                    onChange={(e) => setFormConsumption(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="export-consumption" className="text-sm text-gray-700 dark:text-gray-300">
                    Consommation
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="export-production"
                    checked={formProduction}
                    onChange={(e) => setFormProduction(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="export-production" className="text-sm text-gray-700 dark:text-gray-300">
                    Production (si disponible)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="export-detailed"
                    checked={formDetailed}
                    onChange={(e) => setFormDetailed(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="export-detailed" className="text-sm text-gray-700 dark:text-gray-300">
                    Données détaillées (courbe de charge 30 min)
                  </label>
                </div>
              </div>
            </div>

            {/* Scheduling */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Planification automatique
              </h3>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={formIntervalMinutes ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '') {
                      setFormIntervalMinutes(null)
                    } else {
                      const num = parseInt(val)
                      setFormIntervalMinutes(num && num >= 15 ? num : 15)
                    }
                  }}
                  min={15}
                  placeholder="Manuel"
                  className="w-32 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  minutes (min. 15, vide = manuel)
                </span>
              </div>
            </div>

            {/* Enable Toggle */}
            <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-6">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Activer l'export
              </span>
              <button
                type="button"
                onClick={() => setFormEnabled(!formEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formEnabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              {existingConfig && (
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Annuler
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {saveMutation.isPending && <RefreshCw size={16} className="animate-spin" />}
                <Save size={16} />
                Enregistrer
              </button>
            </div>
          </div>
        )}

        {/* View Mode - Show current config */}
        {existingConfig && !isEditing && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">URL</p>
                <p className="font-medium text-gray-900 dark:text-white truncate">{vmUrl}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Base de données</p>
                <p className="font-medium text-gray-900 dark:text-white">{vmDatabase}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Intervalle</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formIntervalMinutes ? `${formIntervalMinutes} min` : 'Manuel'}
                </p>
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {formConsumption && (
                <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                  Consommation
                </span>
              )}
              {formProduction && (
                <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                  Production
                </span>
              )}
              {formDetailed && (
                <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                  Données détaillées
                </span>
              )}
              {vmUsername && (
                <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">
                  Auth
                </span>
              )}
              <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                {existingConfig.export_count} exports
              </span>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!existingConfig && !isEditing && (
          <div className="text-center py-12">
            <Database size={48} className="mx-auto text-gray-400 dark:text-gray-500 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Aucune configuration VictoriaMetrics
            </p>
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg transition-colors"
            >
              Configurer VictoriaMetrics
            </button>
          </div>
        )}
      </div>

      {/* Metrics Section - Inline */}
      {existingConfig && existingConfig.is_enabled && (
        <MetricsSection
          metricsData={metricsData}
          isLoading={metricsLoading}
          onRefresh={loadMetrics}
          title="Métriques VictoriaMetrics"
          subtitle="Données présentes dans la base time-series"
          metricIdField="name"
          emptyIcon={<Database size={40} className="mx-auto text-gray-400 dark:text-gray-500 mb-3" />}
        />
      )}
    </div>
  )
}
