import { afterEach, describe, expect, it } from 'vitest'
import { getRuntimeDefaults } from '../runtimeDefaults'

describe('getRuntimeDefaults', () => {
  afterEach(() => {
    delete window.__ENV__
  })

  it('valeurs par défaut sans window.__ENV__', () => {
    expect(getRuntimeDefaults()).toEqual({
      mqttBroker: '',
      mqttPort: 1883,
      topicPrefix: 'myelectricaldata',
      entityPrefix: 'myelectricaldata',
      discoveryPrefix: 'homeassistant',
      haUrl: '',
      vmUrl: '',
    })
  })

  it('reprend les valeurs injectées au démarrage du conteneur', () => {
    window.__ENV__ = {
      VITE_DEFAULT_MQTT_BROKER: 'mqtt.maison.lan',
      VITE_DEFAULT_MQTT_PORT: '8883',
      VITE_DEFAULT_ENTITY_PREFIX: 'med_v2',
      VITE_DEFAULT_HA_URL: 'http://ha.maison.lan:8123',
    }

    const defaults = getRuntimeDefaults()

    expect(defaults.mqttBroker).toBe('mqtt.maison.lan')
    expect(defaults.mqttPort).toBe(8883)
    expect(defaults.entityPrefix).toBe('med_v2')
    expect(defaults.haUrl).toBe('http://ha.maison.lan:8123')
    expect(defaults.topicPrefix).toBe('myelectricaldata')
  })

  it('port illisible ou vide : 1883', () => {
    window.__ENV__ = { VITE_DEFAULT_MQTT_PORT: 'abc' }
    expect(getRuntimeDefaults().mqttPort).toBe(1883)
    window.__ENV__ = { VITE_DEFAULT_MQTT_PORT: '' }
    expect(getRuntimeDefaults().mqttPort).toBe(1883)
  })
})
