/**
 * MQTT Export Page (Client Mode Only)
 *
 * Dedicated page for configuring MQTT export with custom topics.
 * Sends electricity data to any MQTT broker with configurable topic structure.
 */

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/stores/notificationStore'
import {
  exportApi,
  ExportConfig,
  ExportConfigCreate,
  MQTTConfig,
  ExportMetricsData,
} from '@/api/export'
import {
  Radio,
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
  Wifi,
  Lock,
  Tag,
  MessageSquare,
} from 'lucide-react'
import MetricsSection from '@/components/MetricsSection'

export default function MQTT() {
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

  // MQTT config
  const [mqttBroker, setMqttBroker] = useState('')
  const [mqttPort, setMqttPort] = useState(1883)
  const [mqttUsername, setMqttUsername] = useState('')
  const [mqttPassword, setMqttPassword] = useState('')
  const [mqttTls, setMqttTls] = useState(false)
  const [topicPrefix, setTopicPrefix] = useState('myelectricaldata')
  const [qos, setQos] = useState(0)
  const [retain, setRetain] = useState(true)

  // Query existing config
  const { data: configsResponse, isLoading } = useQuery({
    queryKey: ['export-configs'],
    queryFn: () => exportApi.listConfigs(),
  })

  // Find existing MQTT config
  const existingConfig = configsResponse?.data?.configs?.find(
    (c) => c.export_type === 'mqtt'
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

      const cfg = fullConfig.config as MQTTConfig
      if (cfg) {
        setMqttBroker(cfg.broker || '')
        setMqttPort(cfg.port || 1883)
        setMqttUsername(cfg.username || '')
        setMqttPassword(cfg.password || '')
        setMqttTls(cfg.use_tls || false)
        setTopicPrefix(cfg.topic_prefix || 'myelectricaldata')
        setQos(cfg.qos ?? 0)
        setRetain(cfg.retain ?? true)
      }
    } catch {
      toast.error('Erreur lors du chargement de la configuration')
    }
  }

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      const config: MQTTConfig = {
        broker: mqttBroker,
        port: mqttPort,
        username: mqttUsername || undefined,
        password: mqttPassword || undefined,
        use_tls: mqttTls,
        topic_prefix: topicPrefix,
        qos,
        retain,
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
          name: 'MQTT',
          export_type: 'mqtt',
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
      toast.success('Configuration sauvegardee')
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
        toast.success('Connexion reussie !')
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
      toast.success(enabled ? 'Export active' : 'Export desactive')
      queryClient.invalidateQueries({ queryKey: ['export-configs'] })
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`)
    },
  })

  const runMutation = useMutation({
    mutationFn: (id: string) => exportApi.runExport(id),
    onSuccess: () => {
      toast.success('Export lance')
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
      toast.error('Erreur lors de la lecture des metriques')
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
    if (!mqttBroker.trim()) {
      toast.error('Veuillez saisir l\'adresse du broker MQTT')
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
          <strong>Export MQTT generique</strong> : Publie vos donnees de consommation et production sur des topics
          personnalisables. Compatible avec tous les brokers MQTT (Mosquitto, EMQX, HiveMQ, etc.).
        </p>
      </div>

      {/* Topic Structure Preview */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Structure des topics</h3>
        <div className="font-mono text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <p><span className="text-primary-600 dark:text-primary-400">{topicPrefix || 'myelectricaldata'}</span>/&lt;pdl&gt;/consumption/daily</p>
          <p><span className="text-primary-600 dark:text-primary-400">{topicPrefix || 'myelectricaldata'}</span>/&lt;pdl&gt;/consumption/detailed</p>
          <p><span className="text-primary-600 dark:text-primary-400">{topicPrefix || 'myelectricaldata'}</span>/&lt;pdl&gt;/production/daily</p>
          <p><span className="text-primary-600 dark:text-primary-400">{topicPrefix || 'myelectricaldata'}</span>/tempo/today</p>
          <p><span className="text-primary-600 dark:text-primary-400">{topicPrefix || 'myelectricaldata'}</span>/ecowatt/today</p>
        </div>
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
                    <ToggleRight size={20} /> Active
                  </>
                ) : (
                  <>
                    <ToggleLeft size={20} /> Desactive
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
                <Play size={16} /> Executer
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
                <Wifi size={20} className="text-primary-600 dark:text-primary-400" />
                Connexion MQTT
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Broker MQTT *
                  </label>
                  <input
                    type="text"
                    value={mqttBroker}
                    onChange={(e) => setMqttBroker(e.target.value)}
                    placeholder="mqtt.example.com"
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Hostname ou IP du broker MQTT
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    value={mqttPort}
                    onChange={(e) => setMqttPort(parseInt(e.target.value) || 1883)}
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4">
                <input
                  type="checkbox"
                  id="mqtt-tls"
                  checked={mqttTls}
                  onChange={(e) => setMqttTls(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="mqtt-tls" className="text-sm text-gray-700 dark:text-gray-300">
                  Utiliser TLS (port 8883 generalement)
                </label>
              </div>
            </div>

            {/* Authentication */}
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
                    value={mqttUsername}
                    onChange={(e) => setMqttUsername(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    value={mqttPassword}
                    onChange={(e) => setMqttPassword(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>

            {/* Topic Configuration */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <MessageSquare size={20} className="text-primary-600 dark:text-primary-400" />
                Configuration des topics
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Prefixe des topics
                  </label>
                  <input
                    type="text"
                    value={topicPrefix}
                    onChange={(e) => setTopicPrefix(e.target.value)}
                    placeholder="myelectricaldata"
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Exemple: <strong>{topicPrefix || 'myelectricaldata'}</strong>/12345678901234/consumption/daily
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      QoS (Quality of Service)
                    </label>
                    <select
                      value={qos}
                      onChange={(e) => setQos(parseInt(e.target.value))}
                      className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value={0}>0 - Au plus une fois (fire and forget)</option>
                      <option value={1}>1 - Au moins une fois (avec accusé)</option>
                      <option value={2}>2 - Exactement une fois (garanti)</option>
                    </select>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="mqtt-retain"
                      checked={retain}
                      onChange={(e) => setRetain(e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                    />
                    <label htmlFor="mqtt-retain" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      Activer le flag Retain (conserver le dernier message)
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Options */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Tag size={20} className="text-primary-600 dark:text-primary-400" />
                Donnees a exporter
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
                    Donnees detaillees (courbe de charge 30 min)
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Broker</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {mqttBroker}:{mqttPort}
                </p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Prefixe topic</p>
                <p className="font-medium text-gray-900 dark:text-white">{topicPrefix}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">QoS</p>
                <p className="font-medium text-gray-900 dark:text-white">{qos}</p>
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
                  Donnees detaillees
                </span>
              )}
              {mqttTls && (
                <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">
                  TLS
                </span>
              )}
              {retain && (
                <span className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
                  Retain
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
            <Radio size={48} className="mx-auto text-gray-400 dark:text-gray-500 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Aucune configuration MQTT
            </p>
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg transition-colors"
            >
              Configurer MQTT
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
          title="Messages MQTT"
          subtitle="Derniers messages publiés sur le broker"
          metricIdField="topic"
          emptyIcon={<Radio size={40} className="mx-auto text-gray-400 dark:text-gray-500 mb-3" />}
        />
      )}
    </div>
  )
}
