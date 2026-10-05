/**
 * Valeurs par défaut des formulaires d'export (MQTT, Home Assistant, VictoriaMetrics), injectées au
 * démarrage du conteneur dans window.__ENV__ (variables VITE_DEFAULT_*, cf. entrypoint.sh). Elles ne
 * servent qu'à préremplir une nouvelle configuration : une configuration enregistrée les remplace.
 */
export interface RuntimeDefaults {
  mqttBroker: string
  mqttPort: number
  topicPrefix: string
  entityPrefix: string
  discoveryPrefix: string
  haUrl: string
  vmUrl: string
}

const DEFAULT_MQTT_PORT = 1883

export function getRuntimeDefaults(): RuntimeDefaults {
  const env = (typeof window !== 'undefined' && window.__ENV__) || {}
  const port = Number.parseInt(env.VITE_DEFAULT_MQTT_PORT || '', 10)

  return {
    mqttBroker: env.VITE_DEFAULT_MQTT_BROKER || '',
    mqttPort: Number.isFinite(port) && port > 0 ? port : DEFAULT_MQTT_PORT,
    topicPrefix: env.VITE_DEFAULT_TOPIC_PREFIX || 'myelectricaldata',
    entityPrefix: env.VITE_DEFAULT_ENTITY_PREFIX || 'myelectricaldata',
    discoveryPrefix: env.VITE_DEFAULT_DISCOVERY_PREFIX || 'homeassistant',
    haUrl: env.VITE_DEFAULT_HA_URL || '',
    vmUrl: env.VITE_DEFAULT_VM_URL || '',
  }
}
