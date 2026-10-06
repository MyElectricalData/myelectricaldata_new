/**
 * Home Assistant Export Page (Client Mode Only)
 *
 * Dedicated page for configuring Home Assistant integrations:
 * - MQTT Discovery: Creates sensors via MQTT auto-discovery
 * - WebSocket API: Sends statistics to the Energy Dashboard
 */

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/stores/notificationStore'
import {
  exportApi,
  ExportConfig,
  ExportConfigCreate,
  HomeAssistantConfig,
  HAImportProgressEvent,
  ExportRunProgressEvent,
  ExportRunCompleteEvent,
  ExportRunEDProgressEvent,
} from '@/api/export'
import { pdlApi } from '@/api/pdl'
import {
  Home,
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
  Radio,
  BarChart3,
  Upload,
  Trash2,
  Zap,
  List,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { getRuntimeDefaults } from '@/utils/runtimeDefaults'

/**
 * Définition des entités Home Assistant de base (templates)
 * Ces entités sont créées automatiquement lors de l'export MQTT Discovery
 */
interface BaseEntity {
  entity_id: string
  name: string
  device: string
  icon: string
  unit?: string
  device_class?: string
  description: string
}

// Entités globales (RTE Tempo, EDF Tempo, EcoWatt)
/**
 * Entités globales (Tempo, Zen Flex, EcoWatt) : entity_id suggéré = sensor.<unique_id>, qui suit entity_prefix
 */
function getGlobalEntities(prefix: string): BaseEntity[] {
  return [
    // RTE Tempo
    {
      entity_id: `sensor.${prefix}_tempo_today`,
      name: 'Tempo Aujourd\'hui',
      device: 'RTE Tempo',
      icon: 'mdi:calendar-today',
      description: 'Couleur du jour Tempo (BLUE, WHITE, RED)',
    },
    {
      entity_id: `sensor.${prefix}_tempo_tomorrow`,
      name: 'Tempo Demain',
      device: 'RTE Tempo',
      icon: 'mdi:calendar-tomorrow',
      description: 'Couleur du lendemain Tempo',
    },
    // EDF Tempo
    {
      entity_id: `sensor.${prefix}_tempo_info`,
      name: 'Tempo Info',
      device: 'EDF Tempo',
      icon: 'mdi:information',
      description: 'Informations générales contrat Tempo',
    },
    {
      entity_id: `sensor.${prefix}_tempo_days_blue`,
      name: 'Jours Bleus',
      device: 'EDF Tempo',
      icon: 'mdi:calendar',
      unit: 'jours',
      description: 'Jours bleus utilisés (restants en attribut)',
    },
    {
      entity_id: `sensor.${prefix}_tempo_days_white`,
      name: 'Jours Blancs',
      device: 'EDF Tempo',
      icon: 'mdi:calendar',
      unit: 'jours',
      description: 'Jours blancs utilisés (restants en attribut)',
    },
    {
      entity_id: `sensor.${prefix}_tempo_days_red`,
      name: 'Jours Rouges',
      device: 'EDF Tempo',
      icon: 'mdi:calendar',
      unit: 'jours',
      description: 'Jours rouges utilisés (restants en attribut)',
    },
    {
      entity_id: `sensor.${prefix}_tempo_price_blue_hc`,
      name: 'Prix Bleu HC',
      device: 'EDF Tempo',
      icon: 'mdi:currency-eur',
      unit: 'EUR/kWh',
      description: 'Tarif heures creuses jour bleu',
    },
    {
      entity_id: `sensor.${prefix}_tempo_price_blue_hp`,
      name: 'Prix Bleu HP',
      device: 'EDF Tempo',
      icon: 'mdi:currency-eur',
      unit: 'EUR/kWh',
      description: 'Tarif heures pleines jour bleu',
    },
    {
      entity_id: `sensor.${prefix}_tempo_price_white_hc`,
      name: 'Prix Blanc HC',
      device: 'EDF Tempo',
      icon: 'mdi:currency-eur',
      unit: 'EUR/kWh',
      description: 'Tarif heures creuses jour blanc',
    },
    {
      entity_id: `sensor.${prefix}_tempo_price_white_hp`,
      name: 'Prix Blanc HP',
      device: 'EDF Tempo',
      icon: 'mdi:currency-eur',
      unit: 'EUR/kWh',
      description: 'Tarif heures pleines jour blanc',
    },
    {
      entity_id: `sensor.${prefix}_tempo_price_red_hc`,
      name: 'Prix Rouge HC',
      device: 'EDF Tempo',
      icon: 'mdi:currency-eur',
      unit: 'EUR/kWh',
      description: 'Tarif heures creuses jour rouge',
    },
    {
      entity_id: `sensor.${prefix}_tempo_price_red_hp`,
      name: 'Prix Rouge HP',
      device: 'EDF Tempo',
      icon: 'mdi:currency-eur',
      unit: 'EUR/kWh',
      description: 'Tarif heures pleines jour rouge',
    },
    // EDF Zen Flex
    {
      entity_id: `sensor.${prefix}_zen_flex_today`,
      name: 'Zen Flex Aujourd\'hui',
      device: 'EDF Zen Flex',
      icon: 'mdi:leaf',
      description: 'Type du jour Zen Flex (ECO, SOBRIETE, BONUS, unknown)',
    },
    {
      entity_id: `sensor.${prefix}_zen_flex_tomorrow`,
      name: 'Zen Flex Demain',
      device: 'EDF Zen Flex',
      icon: 'mdi:calendar-tomorrow',
      description: 'Type du lendemain Zen Flex (unknown avant sa publication par EDF)',
    },
    // EcoWatt
    {
      entity_id: `sensor.${prefix}_ecowatt_j0`,
      name: 'EcoWatt J0',
      device: 'RTE EcoWatt',
      icon: 'mdi:leaf',
      description: 'Signal EcoWatt aujourd\'hui (1=vert, 2=orange, 3=rouge)',
    },
    {
      entity_id: `sensor.${prefix}_ecowatt_j1`,
      name: 'EcoWatt J+1',
      device: 'RTE EcoWatt',
      icon: 'mdi:leaf',
      description: 'Signal EcoWatt demain',
    },
    {
      entity_id: `sensor.${prefix}_ecowatt_j2`,
      name: 'EcoWatt J+2',
      device: 'RTE EcoWatt',
      icon: 'mdi:leaf',
      description: 'Signal EcoWatt après-demain',
    },
  ]
}

/** Périodes des capteurs HP/HC (cf. tariff.summarize_hp_hc_kwh côté API) */
const HP_HC_PERIODS = [
  { key: 'yesterday', label: 'hier' },
  { key: 'this_week', label: 'semaine' },
  { key: 'this_month', label: 'mois' },
  { key: 'this_year', label: 'année' },
] as const

/**
 * Génère les entités spécifiques à un PDL
 */
function getPdlEntities(pdl: string, prefix: string): BaseEntity[] {
  return [
    {
      entity_id: `sensor.${prefix}_linky_${pdl}_consumption`,
      name: `Consommation ${pdl}`,
      device: `Linky ${pdl}`,
      icon: 'mdi:flash',
      unit: 'kWh',
      device_class: 'energy',
      description: 'Consommation journalière (avec historique 31j en attributs)',
    },
    {
      entity_id: `sensor.${prefix}_linky_${pdl}_consumption_last7day`,
      name: `Conso 7j ${pdl}`,
      device: `Linky ${pdl}`,
      icon: 'mdi:flash',
      unit: 'kWh',
      device_class: 'energy',
      description: 'Total consommation des 7 derniers jours',
    },
    {
      entity_id: `sensor.${prefix}_linky_${pdl}_consumption_last14day`,
      name: `Conso 14j ${pdl}`,
      device: `Linky ${pdl}`,
      icon: 'mdi:flash',
      unit: 'kWh',
      device_class: 'energy',
      description: 'Total consommation des 14 derniers jours',
    },
    {
      entity_id: `sensor.${prefix}_linky_${pdl}_consumption_last30day`,
      name: `Conso 30j ${pdl}`,
      device: `Linky ${pdl}`,
      icon: 'mdi:flash',
      unit: 'kWh',
      device_class: 'energy',
      description: 'Total consommation des 30 derniers jours',
    },
    ...HP_HC_PERIODS.flatMap(({ key, label }) =>
      (['hp', 'hc'] as const).map((tariff) => ({
        entity_id: `sensor.${prefix}_linky_${pdl}_consumption_${key}_${tariff}`,
        name: `Conso ${label} ${tariff.toUpperCase()} ${pdl}`,
        device: `Linky ${pdl}`,
        icon: tariff === 'hc' ? 'mdi:weather-night' : 'mdi:white-balance-sunny',
        unit: 'kWh',
        device_class: 'energy',
        description: `Consommation ${tariff === 'hc' ? 'heures creuses' : 'heures pleines'} ${label} (contrat HC/HP avec données détaillées)`,
      }))
    ),
    {
      entity_id: `sensor.${prefix}_linky_${pdl}_production`,
      name: `Production ${pdl}`,
      device: `Linky ${pdl}`,
      icon: 'mdi:solar-power',
      unit: 'kWh',
      device_class: 'energy',
      description: 'Production journalière (avec historique 31j en attributs)',
    },
    {
      entity_id: `sensor.${prefix}_linky_${pdl}_production_last7day`,
      name: `Prod 7j ${pdl}`,
      device: `Linky ${pdl}`,
      icon: 'mdi:solar-power',
      unit: 'kWh',
      device_class: 'energy',
      description: 'Total production des 7 derniers jours',
    },
    {
      entity_id: `sensor.${prefix}_linky_${pdl}_production_last14day`,
      name: `Prod 14j ${pdl}`,
      device: `Linky ${pdl}`,
      icon: 'mdi:solar-power',
      unit: 'kWh',
      device_class: 'energy',
      description: 'Total production des 14 derniers jours',
    },
    {
      entity_id: `sensor.${prefix}_linky_${pdl}_production_last30day`,
      name: `Prod 30j ${pdl}`,
      device: `Linky ${pdl}`,
      icon: 'mdi:solar-power',
      unit: 'kWh',
      device_class: 'energy',
      description: 'Total production des 30 derniers jours',
    },
  ]
}

export default function HomeAssistant() {
  const runtimeDefaults = getRuntimeDefaults()
  const queryClient = useQueryClient()

  // State
  const [isEditing, setIsEditing] = useState(false)
  const [testingConfig, setTestingConfig] = useState(false)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [importingStats, setImportingStats] = useState(false)
  const [clearingStats, setClearingStats] = useState(false)
  const [importProgress, setImportProgress] = useState<HAImportProgressEvent | null>(null)
  const [syncDelayMs, setSyncDelayMs] = useState(500)
  const [chunkSize, setChunkSize] = useState(2000)
  const [incrementalImport, setIncrementalImport] = useState(true)
  const [energyIntervalMinutes, setEnergyIntervalMinutes] = useState<number | null>(null)

  // Run export modal state
  const [runModalOpen, setRunModalOpen] = useState(false)
  const [runProgress, setRunProgress] = useState<ExportRunProgressEvent | null>(null)
  const [runComplete, setRunComplete] = useState<ExportRunCompleteEvent | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [runEDProgress, setRunEDProgress] = useState<ExportRunEDProgressEvent | null>(null)

  // Form state
  const [mqttExportEnabled, setMqttExportEnabled] = useState(true)
  const [energyExportEnabled, setEnergyExportEnabled] = useState(true)
  const [formConsumption, setFormConsumption] = useState(true)
  const [formProduction, setFormProduction] = useState(true)
  const [formDetailed, setFormDetailed] = useState(false)
  const [formIntervalMinutes, setFormIntervalMinutes] = useState<number | null>(30)

  // MQTT Discovery config
  const [mqttBroker, setMqttBroker] = useState(runtimeDefaults.mqttBroker)
  const [mqttPort, setMqttPort] = useState(runtimeDefaults.mqttPort)
  const [mqttUsername, setMqttUsername] = useState('')
  const [mqttPassword, setMqttPassword] = useState('')
  const [mqttTls, setMqttTls] = useState(false)
  const [entityPrefix, setEntityPrefix] = useState(runtimeDefaults.entityPrefix)
  const [discoveryPrefix, setDiscoveryPrefix] = useState(runtimeDefaults.discoveryPrefix)

  // WebSocket API config
  const [haUrl, setHaUrl] = useState(runtimeDefaults.haUrl)
  const [haToken, setHaToken] = useState('')
  const [statisticIdPrefix, setStatisticIdPrefix] = useState('myelectricaldata')

  // Query existing config
  const { data: configsResponse, isLoading } = useQuery({
    queryKey: ['export-configs'],
    queryFn: () => exportApi.listConfigs(),
  })

  // Query PDLs for entity list
  const { data: pdlsResponse, isLoading: pdlsLoading } = useQuery({
    queryKey: ['pdls'],
    queryFn: () => pdlApi.list(),
  })

  // State for base entities section
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set())
  const [entityValues, setEntityValues] = useState<Record<string, string | null>>({})
  const [loadingEntities, setLoadingEntities] = useState<Set<string>>(new Set())
  const [detectedPdls, setDetectedPdls] = useState<string[]>([]) // PDLs detected from metrics

  // Find existing Home Assistant config
  const existingConfig = configsResponse?.data?.configs?.find(
    (c) => c.export_type === 'home_assistant'
  )

  // Build complete entity list (global + per-PDL)
  // Priority: 1. PDLs actifs from API, 2. PDLs detected from metrics, 3. usage_point_ids from export config
  // En mode client, pdlsResponse est directement un tableau (pas enveloppé dans { data: [...] })
  // En mode serveur, c'est { success: true, data: [...] }
  const pdls = Array.isArray(pdlsResponse)
    ? pdlsResponse
    : (pdlsResponse?.data || [])
  // Filtrer uniquement les PDLs actifs
  const activePdls = pdls.filter((pdl) => pdl.is_active)
  const apiPdlIds = activePdls.map((pdl) => pdl.usage_point_id)

  // Toujours utiliser les PDLs de l'API s'ils sont disponibles (même si on a des detectedPdls)
  // Cela garantit que les PDLs s'affichent dès que la requête API est terminée
  const pdlIds = (() => {
    if (apiPdlIds.length > 0) {
      return apiPdlIds
    }
    if (detectedPdls.length > 0) {
      return detectedPdls
    }
    return existingConfig?.usage_point_ids || []
  })()

  const allEntities = [
    ...getGlobalEntities(entityPrefix),
    ...pdlIds.flatMap((pdlId) => getPdlEntities(pdlId, entityPrefix)),
  ]

  // Group entities by device
  const entitiesByDevice = allEntities.reduce(
    (acc, entity) => {
      if (!acc[entity.device]) {
        acc[entity.device] = []
      }
      acc[entity.device].push(entity)
      return acc
    },
    {} as Record<string, BaseEntity[]>
  )

  const toggleDevice = (device: string) => {
    setExpandedDevices((prev) => {
      const next = new Set(prev)
      if (next.has(device)) {
        next.delete(device)
      } else {
        next.add(device)
      }
      return next
    })
  }

  // Load existing config into form
  useEffect(() => {
    if (existingConfig) {
      loadConfigIntoForm(existingConfig)
    }
  }, [existingConfig?.id])

  // Auto-load metrics when config is enabled (to detect PDLs)
  useEffect(() => {
    if (existingConfig?.is_enabled && !metricsLoading && Object.keys(entityValues).length === 0) {
      loadMetrics()
    }
  }, [existingConfig?.is_enabled])

  const loadConfigIntoForm = async (config: ExportConfig) => {
    try {
      const response = await exportApi.getConfig(config.id)
      const fullConfig = response.data
      if (!fullConfig) return

      setFormConsumption(fullConfig.export_consumption)
      setFormProduction(fullConfig.export_production)
      setFormDetailed(fullConfig.export_detailed)
      setFormIntervalMinutes(fullConfig.export_interval_minutes ?? null)

      const cfg = fullConfig.config as HomeAssistantConfig
      if (cfg) {
        // MQTT config
        setMqttBroker(cfg.mqtt_broker || '')
        setMqttPort(cfg.mqtt_port || 1883)
        setMqttUsername(cfg.mqtt_username || '')
        setMqttPassword(cfg.mqtt_password || '')
        setMqttTls(cfg.mqtt_use_tls || false)
        setEntityPrefix(cfg.entity_prefix || 'myelectricaldata')
        setDiscoveryPrefix(cfg.discovery_prefix || 'homeassistant')
        setMqttExportEnabled(cfg.mqtt_enabled ?? true)

        // WebSocket config
        setHaUrl(cfg.ha_url || '')
        setHaToken(cfg.ha_token || '')
        setStatisticIdPrefix(cfg.statistic_id_prefix || 'myelectricaldata')
        setEnergyExportEnabled(cfg.energy_enabled ?? true)

        // Energy Dashboard import settings
        setSyncDelayMs(cfg.sync_delay_ms ?? 500)
        setChunkSize(cfg.chunk_size ?? 2000)
        setIncrementalImport(cfg.incremental_import ?? true)
        setEnergyIntervalMinutes(cfg.energy_interval_minutes ?? null)
      }
    } catch {
      toast.error('Erreur lors du chargement de la configuration')
    }
  }

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Toujours inclure les deux configurations (MQTT Discovery + WebSocket API)
      const config: HomeAssistantConfig = {
        // MQTT Discovery config
        mqtt_broker: mqttBroker,
        mqtt_port: mqttPort,
        mqtt_username: mqttUsername || undefined,
        mqtt_password: mqttPassword || undefined,
        mqtt_use_tls: mqttTls,
        entity_prefix: entityPrefix,
        discovery_prefix: discoveryPrefix,
        mqtt_enabled: mqttExportEnabled,
        // WebSocket API config
        ha_url: haUrl,
        ha_token: haToken,
        statistic_id_prefix: statisticIdPrefix,
        energy_enabled: energyExportEnabled,
        // Energy Dashboard import settings
        sync_delay_ms: syncDelayMs,
        chunk_size: chunkSize,
        incremental_import: incrementalImport,
        energy_interval_minutes: energyIntervalMinutes,
      }

      if (existingConfig) {
        // is_enabled = true si au moins un des deux modes est activé
        const isEnabled = mqttExportEnabled || energyExportEnabled
        return exportApi.updateConfig(existingConfig.id, {
          config,
          is_enabled: isEnabled,
          export_consumption: formConsumption,
          export_production: formProduction,
          export_detailed: formDetailed,
          export_interval_minutes: formIntervalMinutes,
        })
      } else {
        const isEnabled = mqttExportEnabled || energyExportEnabled
        const createData: ExportConfigCreate = {
          name: 'Home Assistant',
          export_type: 'home_assistant',
          config,
          is_enabled: isEnabled,
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

  const handleRunExport = (id: string) => {
    setRunModalOpen(true)
    setRunProgress(null)
    setRunComplete(null)
    setRunError(null)
    setRunEDProgress(null)

    exportApi.runExportWithProgress(
      id,
      (progress) => setRunProgress(progress),
      (result) => {
        setRunComplete(result)
        queryClient.invalidateQueries({ queryKey: ['export-configs'] })
      },
      (error) => setRunError(error),
      (edProgress) => setRunEDProgress(edProgress),
    )
  }

  // Load all metrics
  const loadMetrics = async () => {
    if (!existingConfig) return

    setMetricsLoading(true)

    try {
      const response = await exportApi.readMetrics(existingConfig.id)
      // Mettre à jour entityValues avec les métriques de type "state"
      if (response.data?.metrics) {
        const newValues: Record<string, string | null> = {}
        const foundPdls = new Set<string>()

        response.data.metrics.forEach((m) => {
          // Détecter les PDLs depuis les métriques (format: pdl est un nombre de 14 chiffres)
          if (m.pdl && /^\d{14}$/.test(m.pdl)) {
            foundPdls.add(m.pdl)
          }

          // Ne traiter que les messages "state" pour les valeurs
          if (m.msg_type !== 'state') return

          const entityId = m.entity
            ? `sensor.${m.entity}`
            : m.topic
              ? `sensor.${m.topic.replace(/\//g, '_')}`
              : null
          if (entityId && m.state !== undefined) {
            newValues[entityId] = String(m.state)
          }
        })

        setEntityValues((prev) => ({ ...prev, ...newValues }))

        // Mettre à jour les PDLs détectés si on en a trouvé
        if (foundPdls.size > 0) {
          setDetectedPdls(Array.from(foundPdls))
        }
      }
    } catch {
      toast.error('Erreur lors de la lecture des métriques')
    } finally {
      setMetricsLoading(false)
    }
  }

  // Refresh a single entity value
  const refreshEntity = async (entityId: string) => {
    if (!existingConfig) return

    setLoadingEntities((prev) => new Set(prev).add(entityId))

    try {
      const response = await exportApi.readMetrics(existingConfig.id)
      if (response.data?.metrics) {
        // Chercher le message "state" correspondant à cette entité
        const metric = response.data.metrics.find((m) => {
          if (m.msg_type !== 'state') return false
          const metricEntityId = m.entity
            ? `sensor.${m.entity}`
            : m.topic
              ? `sensor.${m.topic.replace(/\//g, '_')}`
              : null
          return metricEntityId === entityId
        })
        if (metric && metric.state !== undefined) {
          setEntityValues((prev) => ({ ...prev, [entityId]: String(metric.state) }))
        } else {
          // Entité non trouvée dans les métriques - pas encore publiée
          setEntityValues((prev) => ({ ...prev, [entityId]: null }))
        }
      }
    } catch (err) {
      toast.error(`Erreur lors de la récupération de ${entityId}`)
    } finally {
      setLoadingEntities((prev) => {
        const next = new Set(prev)
        next.delete(entityId)
        return next
      })
    }
  }

  const handleSubmit = () => {
    // Validation : au moins une des deux configurations doit être remplie
    const hasMqttConfig = mqttBroker.trim() !== ''
    const hasWsConfig = haUrl.trim() !== '' && haToken.trim() !== ''

    if (!hasMqttConfig && !hasWsConfig) {
      toast.error('Veuillez configurer au moins MQTT Discovery ou l\'API Statistiques')
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
                onClick={() => handleRunExport(existingConfig.id)}
                disabled={!existingConfig.is_enabled || runModalOpen}
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
            {/* MQTT Discovery Configuration - Pour les sensors */}
            <div>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-6">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>MQTT Discovery</strong> : Crée des <strong>sensors</strong> automatiquement dans Home Assistant
                  (consommation journalière, puissance, Tempo, EcoWatt...). Les entités sont regroupées sous un appareil "MyElectricalData".
                  <br /><span className="text-blue-600 dark:text-blue-300 mt-1 block">⚠️ Il n'est pas possible d'envoyer des données vers le tableau Énergie via MQTT.</span>
                </p>
              </div>

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
                      placeholder="homeassistant.local ou core-mosquitto"
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Utilisateur (optionnel)
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
                      Mot de passe (optionnel)
                    </label>
                    <input
                      type="password"
                      value={mqttPassword}
                      onChange={(e) => setMqttPassword(e.target.value)}
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
                    Utiliser TLS (port 8883 généralement)
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Préfixe des entités
                    </label>
                    <input
                      type="text"
                      value={entityPrefix}
                      onChange={(e) => setEntityPrefix(e.target.value)}
                      placeholder="myelectricaldata"
                      className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Exemple: sensor.<strong>{entityPrefix || 'myelectricaldata'}</strong>_tempo_today
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Préfixe Discovery
                    </label>
                    <input
                      type="text"
                      value={discoveryPrefix}
                      onChange={(e) => setDiscoveryPrefix(e.target.value)}
                      placeholder="homeassistant"
                      className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Topic: <strong>{discoveryPrefix || 'homeassistant'}</strong>/sensor/.../config. Doit être celui de
                      l'intégration MQTT de Home Assistant, sinon aucune entité n'est créée.
                    </p>
                  </div>
              </div>
            </div>

            {/* WebSocket API Configuration - Pour le tableau Énergie */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg mb-6">
                <p className="text-sm text-green-800 dark:text-green-200">
                  <strong>API Statistiques (WebSocket)</strong> : Permet d'envoyer les données de consommation/production
                  directement dans le <strong>tableau de bord Énergie</strong> de Home Assistant.
                  <br /><span className="text-green-600 dark:text-green-300 mt-1 block">✅ C'est la seule méthode pour alimenter le tableau Énergie avec vos données Enedis.</span>
                </p>
              </div>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <BarChart3 size={20} className="text-primary-600 dark:text-primary-400" />
                Connexion Home Assistant
              </h3>

              <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      URL Home Assistant *
                    </label>
                    <input
                      type="url"
                      value={haUrl}
                      onChange={(e) => setHaUrl(e.target.value)}
                      placeholder="http://homeassistant.local:8123"
                      className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      URL complète de votre instance Home Assistant
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Token d'accès longue durée *
                    </label>
                    <input
                      type="password"
                      value={haToken}
                      onChange={(e) => setHaToken(e.target.value)}
                      placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
                      className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Créez un token dans votre profil HA : Paramètres → Profil → Tokens d'accès longue durée
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Préfixe des statistiques
                    </label>
                    <input
                      type="text"
                      value={statisticIdPrefix}
                      onChange={(e) => setStatisticIdPrefix(e.target.value)}
                      placeholder="myelectricaldata"
                      className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      ID: <strong>{statisticIdPrefix || 'myelectricaldata'}</strong>:consumption_12345678901234
                    </p>
                  </div>

                  {/* Paramètres d'import Energy Dashboard */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-1.5">
                      <Settings size={14} className="text-gray-500 dark:text-gray-400" />
                      Paramètres d'import
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Mode d'import
                        </label>
                        <select
                          value={incrementalImport ? 'incremental' : 'full'}
                          onChange={(e) => setIncrementalImport(e.target.value === 'incremental')}
                          className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        >
                          <option value="incremental">Différentiel (rapide)</option>
                          <option value="full">Complet (réinitialise)</option>
                        </select>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Différentiel : seules les nouvelles données
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Délai entre chunks
                        </label>
                        <select
                          value={syncDelayMs}
                          onChange={(e) => setSyncDelayMs(parseInt(e.target.value))}
                          className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        >
                          <option value={0}>Aucun (0ms)</option>
                          <option value={100}>100ms</option>
                          <option value={500}>500ms (recommandé)</option>
                          <option value={1000}>1s</option>
                          <option value={2000}>2s</option>
                          <option value={5000}>5s (lent)</option>
                        </select>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Temps d'attente entre chaque envoi
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Taille des chunks
                        </label>
                        <select
                          value={chunkSize}
                          onChange={(e) => setChunkSize(parseInt(e.target.value))}
                          className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        >
                          <option value={100}>100</option>
                          <option value={250}>250</option>
                          <option value={500}>500</option>
                          <option value={1000}>1000</option>
                          <option value={2000}>2000 (recommandé)</option>
                        </select>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Nombre de points par envoi WebSocket
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            {/* Data Options */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
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
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Clock size={20} className="text-primary-600 dark:text-primary-400" />
                Planification automatique
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                    <Radio size={14} /> MQTT Discovery
                  </label>
                  <select
                    value={formIntervalMinutes ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      setFormIntervalMinutes(val === '' ? null : parseInt(val))
                    }}
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  >
                    <option value="">Manuel</option>
                    <option value={15}>Toutes les 15 min</option>
                    <option value={30}>Toutes les 30 min</option>
                    <option value={60}>Toutes les 60 min</option>
                    <option value={120}>Toutes les 120 min</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                    <Zap size={14} /> Energy Dashboard
                  </label>
                  <select
                    value={energyIntervalMinutes ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      setEnergyIntervalMinutes(val === '' ? null : parseInt(val))
                    }}
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  >
                    <option value="">Manuel</option>
                    <option value={15}>Toutes les 15 min</option>
                    <option value={30}>Toutes les 30 min</option>
                    <option value={60}>Toutes les 60 min</option>
                    <option value={120}>Toutes les 120 min</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Enable Toggles */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Radio size={14} /> Activer MQTT Discovery
                </span>
                <button
                  type="button"
                  onClick={() => setMqttExportEnabled(!mqttExportEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    mqttExportEnabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      mqttExportEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Zap size={14} /> Activer Energy Dashboard
                </span>
                <button
                  type="button"
                  onClick={() => setEnergyExportEnabled(!energyExportEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    energyExportEnabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      energyExportEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
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
            {/* Mode badges avec état */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`text-sm px-3 py-1 rounded-lg flex items-center gap-1 ${
                mqttExportEnabled
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 line-through'
              }`}>
                <Radio size={14} /> MQTT Discovery
              </span>
              <span className={`text-sm px-3 py-1 rounded-lg flex items-center gap-1 ${
                energyExportEnabled
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 line-through'
              }`}>
                <Zap size={14} /> Energy Dashboard
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {mqttBroker && (
                <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Broker MQTT</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {mqttBroker}:{mqttPort}
                  </p>
                </div>
              )}
              {haUrl && (
                <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400">URL Home Assistant</p>
                  <p className="font-medium text-gray-900 dark:text-white truncate">{haUrl}</p>
                </div>
              )}
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">MQTT toutes les</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formIntervalMinutes ? `${formIntervalMinutes} min` : 'Manuel'}
                </p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Energy toutes les</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {energyIntervalMinutes ? `${energyIntervalMinutes} min` : 'Manuel'}
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
              {mqttTls && (
                <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">
                  TLS
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
            <Home size={48} className="mx-auto text-gray-400 dark:text-gray-500 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Aucune configuration Home Assistant
            </p>
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg transition-colors"
            >
              Configurer Home Assistant
            </button>
          </div>
        )}
      </div>

      {/* Base Entities Section */}
      {existingConfig && existingConfig.is_enabled && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-300 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <List size={20} className="text-primary-600 dark:text-primary-400" />
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Entités Home Assistant
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {allEntities.length} entités seront créées via MQTT Discovery
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Les entités créées par une version antérieure gardent l'identifiant choisi alors par Home Assistant
                  (ex. sensor.linky_&lt;pdl&gt;_consumption) : renommez-les dans Home Assistant pour les aligner.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Indicateur de chargement à côté du bouton */}
              {metricsLoading && (
                <span className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <RefreshCw size={14} className="animate-spin" />
                  Chargement...
                </span>
              )}
              <button
                onClick={loadMetrics}
                disabled={metricsLoading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={16} className={metricsLoading ? 'animate-spin' : ''} />
                Actualiser
              </button>
            </div>
          </div>

          {/* Entity list grouped by device */}
          <div className="space-y-2">
            {Object.entries(entitiesByDevice).map(([device, entities]) => {
              const isExpanded = expandedDevices.has(device)

              return (
                <div
                  key={device}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => toggleDevice(device)}
                    className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown size={16} className="text-gray-500" />
                      ) : (
                        <ChevronRight size={16} className="text-gray-500" />
                      )}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {device}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                        {entities.length}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {entities.map((entity) => {
                        const value = entityValues[entity.entity_id] ?? null
                        const isLoading = loadingEntities.has(entity.entity_id)
                        return (
                          <div
                            key={entity.entity_id}
                            className="p-3 hover:bg-gray-50 dark:hover:bg-gray-900/20 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs text-gray-500 dark:text-gray-500">
                                    {entity.icon}
                                  </span>
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {entity.name}
                                  </span>
                                  {entity.unit && (
                                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                      {entity.unit}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-mono text-gray-600 dark:text-gray-400 break-all">
                                  {entity.entity_id}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                  {entity.description}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {value !== null ? (
                                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                    {value}
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-400 dark:text-gray-500 italic">
                                    null
                                  </span>
                                )}
                                <button
                                  onClick={() => refreshEntity(entity.entity_id)}
                                  disabled={isLoading}
                                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-50"
                                  title="Actualiser cette entité"
                                >
                                  <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Indicateur de chargement PDLs en cours */}
            {pdlsLoading && (
              <div className="flex items-center justify-center py-4 text-sm text-gray-500 dark:text-gray-400">
                <RefreshCw size={16} className="animate-spin mr-2" />
                Chargement des points de livraison...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Energy Dashboard Statistics Section */}
      {existingConfig && haUrl && haToken && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-300 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Zap size={20} className="text-green-500" />
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Tableau Énergie
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Statistiques de consommation/production pour le Energy Dashboard
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg mb-4">
            <p className="text-sm text-green-800 dark:text-green-200">
              Ces boutons permettent d'envoyer l'historique de vos données Enedis directement dans le
              <strong> tableau de bord Énergie</strong> de Home Assistant via l'API WebSocket.
            </p>
          </div>

          {/* Barre de progression */}
          {importingStats && importProgress && (
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {importProgress.message}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {importProgress.percent}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className="bg-green-600 dark:bg-green-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${importProgress.percent}%` }}
                />
              </div>
              <div className="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span>Conso: {importProgress.consumption.toLocaleString()}</span>
                <span>Coût: {importProgress.cost.toLocaleString()}</span>
                <span>Prod: {importProgress.production.toLocaleString()}</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                setImportingStats(true)
                setImportProgress(null)

                exportApi.importHAStatisticsWithProgress(
                  existingConfig.id,
                  !incrementalImport, // clear_first: false en mode incrémental
                  syncDelayMs,
                  chunkSize,
                  incrementalImport,
                  // onProgress
                  (progress: HAImportProgressEvent) => {
                    setImportProgress(progress)
                  },
                  // onComplete
                  (result) => {
                    setImportingStats(false)
                    setImportProgress(null)
                    if (result.success) {
                      toast.success(
                        `Import réussi : ${result.consumption} conso, ${result.cost} coût, ${result.production} prod`
                      )
                    } else {
                      toast.error(result.message || 'Erreur lors de l\'import')
                    }
                  },
                  // onError
                  (error) => {
                    setImportingStats(false)
                    setImportProgress(null)
                    toast.error(`Erreur: ${error}`)
                  }
                )
              }}
              disabled={importingStats || clearingStats}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {importingStats ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Upload size={16} />
              )}
              Importer les statistiques
            </button>

            <button
              onClick={async () => {
                if (!confirm('Voulez-vous vraiment supprimer toutes les statistiques MyElectricalData de Home Assistant ?')) {
                  return
                }
                setClearingStats(true)
                try {
                  const response = await exportApi.clearHAStatistics(existingConfig.id)
                  if (response.data?.success) {
                    toast.success(response.data.message || 'Statistiques supprimées')
                  } else {
                    toast.error(response.data?.message || 'Erreur lors de la suppression')
                  }
                } catch (err) {
                  toast.error(`Erreur: ${err instanceof Error ? err.message : 'Erreur inconnue'}`)
                } finally {
                  setClearingStats(false)
                }
              }}
              disabled={clearingStats || importingStats}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {clearingStats ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
              Supprimer les statistiques
            </button>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            L'import injecte les statistiques de consommation et les entités de coût associées (<code>sensor.linky_xxx_cost</code>) calculées selon votre contrat.
            Dans le tableau de bord Énergie (<strong>Paramètres → Tableaux de bord → Énergie</strong>), sélectionnez cette entité sous <em>« Utiliser une entité suivant les coûts totaux »</em> pour afficher vos coûts historiques exacts sans template.
          </p>
        </div>
      )}

      {/* Run Export Progress Modal */}
      {runModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-300 dark:border-gray-700 w-full max-w-lg mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Play size={20} className="text-primary-600 dark:text-primary-400" />
              Export Home Assistant
            </h3>

            {/* Progression */}
            {runProgress && !runComplete && !runError && (
              <div className="space-y-4">
                {/* MQTT Discovery */}
                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <Radio size={14} className="text-primary-500" /> MQTT Discovery
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {runProgress.step}/{runProgress.total_steps}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{runProgress.message}</p>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-primary-600 dark:bg-primary-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${runProgress.percent}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>Tempo: {runProgress.tempo}</span>
                    <span>EcoWatt: {runProgress.ecowatt}</span>
                    <span>Conso: {runProgress.consumption}</span>
                    <span>Prod: {runProgress.production}</span>
                  </div>
                </div>

                {/* Energy Dashboard */}
                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <Zap size={14} className="text-primary-500" /> Energy Dashboard
                    </p>
                    {runEDProgress && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        {runEDProgress.step}/{runEDProgress.total_steps}
                      </span>
                    )}
                  </div>
                  {runEDProgress ? (
                    <>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{runEDProgress.message}</p>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-primary-600 dark:bg-primary-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${runEDProgress.percent}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>Conso: {runEDProgress.ed_consumption}</span>
                        <span>Coût: {runEDProgress.ed_cost}</span>
                        <span>Prod: {runEDProgress.ed_production}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">En attente...</p>
                  )}
                </div>

                {runProgress.status === 'warning' && (
                  <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertCircle size={12} />
                    Erreur partielle (l'export continue)
                  </div>
                )}
              </div>
            )}

            {/* État initial (pas encore de progression) */}
            {!runProgress && !runComplete && !runError && (
              <div className="flex items-center gap-3 py-4">
                <RefreshCw size={20} className="animate-spin text-primary-600 dark:text-primary-400" />
                <span className="text-gray-600 dark:text-gray-400">Connexion en cours...</span>
              </div>
            )}

            {/* Résultat final */}
            {runComplete && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle size={20} />
                  <span className="font-medium">{runComplete.message}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Tempo</span>
                    <p className="font-medium text-gray-900 dark:text-white">{runComplete.tempo} entités</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">EcoWatt</span>
                    <p className="font-medium text-gray-900 dark:text-white">{runComplete.ecowatt} entités</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Consommation</span>
                    <p className="font-medium text-gray-900 dark:text-white">{runComplete.consumption} sensors</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Production</span>
                    <p className="font-medium text-gray-900 dark:text-white">{runComplete.production} sensors</p>
                  </div>
                  {runComplete.cost !== undefined && runComplete.cost > 0 && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Coût</span>
                      <p className="font-medium text-gray-900 dark:text-white">{runComplete.cost} sensors</p>
                    </div>
                  )}
                  {runComplete.max_power !== undefined && runComplete.max_power > 0 && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Puissance Max</span>
                      <p className="font-medium text-gray-900 dark:text-white">{runComplete.max_power} sensors</p>
                    </div>
                  )}
                </div>
                {runComplete.energy_dashboard && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm">
                    <p className="font-medium text-green-700 dark:text-green-300 mb-1 flex items-center gap-1">
                      <Zap size={14} /> Energy Dashboard
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-green-600 dark:text-green-400">
                      <span>Conso: {runComplete.energy_dashboard.consumption}</span>
                      <span>Coût: {runComplete.energy_dashboard.cost}</span>
                      <span>Prod: {runComplete.energy_dashboard.production}</span>
                    </div>
                  </div>
                )}
                {runComplete.errors && runComplete.errors.length > 0 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                    <p className="font-medium text-amber-700 dark:text-amber-300 mb-1">Erreurs partielles :</p>
                    {runComplete.errors.map((err, i) => (
                      <p key={i} className="text-amber-600 dark:text-amber-400 text-xs">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Erreur */}
            {runError && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 py-2">
                <AlertCircle size={20} />
                <span>{runError}</span>
              </div>
            )}

            {/* Bouton fermer */}
            {(runComplete || runError) && (
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setRunModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
