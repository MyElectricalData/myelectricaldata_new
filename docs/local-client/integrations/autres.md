---
sidebar_position: 5
title: Autres intégrations
---

# Autres intégrations domotiques

Le client local peut s'intégrer avec de nombreux autres systèmes domotiques grâce à son API REST, son support MQTT et ses métriques Prometheus.

## Domoticz

### Via MQTT

Domoticz supporte nativement MQTT via le plugin **MQTT Client Gateway with LAN interface**.

#### Configuration du plugin

1. **Configuration** → **Matériel** → **Ajouter**
2. Type : `MQTT Client Gateway with LAN interface`
3. Configuration :
   - Remote Address : IP de votre broker
   - Port : 1883
   - Publish Topic : `out`

#### Créer les capteurs virtuels

1. **Configuration** → **Matériel** → Ajoutez un **Dummy**
2. Créez des **Virtual Sensors** de type `kWh` ou `Electric`

#### Configuration du client

```yaml
mqtt:
  enabled: true
  host: "votre_broker"
  topic_prefix: "domoticz/in"
  format: "domoticz"  # Format spécifique Domoticz
```

Le format Domoticz envoie des messages de ce type :

```json
{
  "idx": 123,
  "nvalue": 0,
  "svalue": "15.234"
}
```

### Via API HTTP

```yaml
domoticz:
  enabled: true
  url: "http://domoticz.local:8080"
  username: ""
  password: ""

  # Mapping des IDX Domoticz
  devices:
    consumption_daily: 123
    production_daily: 124
    max_power: 125
```

## OpenHAB

### Via MQTT

OpenHAB s'intègre facilement via son **MQTT Binding**.

#### Installation du binding

1. **Settings** → **Bindings** → **Install MQTT Binding**
2. Configurez un **Bridge** vers votre broker

#### Configuration des Items

Créez un fichier `myelectricaldata.items` :

```java
Number:Energy Linky_Consumption_Daily "Consommation [%.2f kWh]" <energy>
  {channel="mqtt:topic:broker:linky:consumption_daily"}

Number:Energy Linky_Consumption_HC "Heures Creuses [%.2f kWh]" <energy>
  {channel="mqtt:topic:broker:linky:consumption_hc"}

Number:Energy Linky_Consumption_HP "Heures Pleines [%.2f kWh]" <energy>
  {channel="mqtt:topic:broker:linky:consumption_hp"}

Number:Power Linky_Max_Power "Puissance Max [%.2f kVA]" <energy>
  {channel="mqtt:topic:broker:linky:max_power"}

Number:Energy Linky_Production_Daily "Production [%.2f kWh]" <solarplant>
  {channel="mqtt:topic:broker:linky:production_daily"}
```

#### Configuration du Thing

```java
Thing mqtt:topic:broker:linky "Linky" (mqtt:broker:broker) {
    Channels:
        Type number : consumption_daily [
            stateTopic="myelectricaldata/+/consumption/daily",
            transformationPattern="JSONPATH:$.value"
        ]
        Type number : consumption_hc [
            stateTopic="myelectricaldata/+/consumption/daily",
            transformationPattern="JSONPATH:$.hc"
        ]
        Type number : consumption_hp [
            stateTopic="myelectricaldata/+/consumption/daily",
            transformationPattern="JSONPATH:$.hp"
        ]
        Type number : production_daily [
            stateTopic="myelectricaldata/+/production/daily",
            transformationPattern="JSONPATH:$.value"
        ]
}
```

### Via REST API

OpenHAB peut récupérer les données via l'API REST du client :

```java
// rules/linky.rules
rule "Update Linky Data"
when
    Time cron "0 0 * * * ?"  // Toutes les heures
then
    val String response = sendHttpGetRequest("http://myelectricaldata-client:8080/api/consumption/daily")
    val consumption = transform("JSONPATH", "$.value", response)
    Linky_Consumption_Daily.postUpdate(consumption)
end
```

## Gladys Assistant

### Via MQTT

Gladys supporte MQTT nativement.

#### Configuration

1. **Intégrations** → **MQTT**
2. Configurez le broker
3. Créez des appareils avec les topics

#### Créer un appareil

1. **Appareils** → **Créer un appareil**
2. Service : MQTT
3. Fonctionnalités :
   - Type : `Énergie`
   - Topic : `myelectricaldata/+/consumption/daily`
   - Transformation : JSONPath `$.value`

### Via API

```javascript
// Script Gladys
const response = await axios.get('http://myelectricaldata-client:8080/api/consumption/daily');
const consumption = response.data.value;

await gladys.device.setValue({
  device_feature_external_id: 'linky-consumption',
  state: consumption
});
```

## Node-RED

Node-RED est idéal pour créer des flux personnalisés.

### Installation

```bash
# Via npm
npm install -g node-red

# Via Docker
docker run -d -p 1880:1880 nodered/node-red
```

### Flux MQTT → Dashboard

```json
[
  {
    "id": "mqtt_in",
    "type": "mqtt in",
    "topic": "myelectricaldata/+/consumption/daily",
    "datatype": "json",
    "broker": "mqtt_broker"
  },
  {
    "id": "extract_value",
    "type": "function",
    "func": "msg.payload = msg.payload.value;\nreturn msg;",
    "wires": [["gauge", "chart"]]
  },
  {
    "id": "gauge",
    "type": "ui_gauge",
    "name": "Consommation",
    "group": "energy",
    "min": 0,
    "max": 50,
    "format": "{{value}} kWh"
  },
  {
    "id": "chart",
    "type": "ui_chart",
    "name": "Historique",
    "group": "energy",
    "chartType": "line"
  }
]
```

### Flux API → InfluxDB

```json
[
  {
    "id": "cron",
    "type": "inject",
    "repeat": "3600",
    "crontab": ""
  },
  {
    "id": "http_request",
    "type": "http request",
    "method": "GET",
    "url": "http://myelectricaldata-client:8080/api/consumption/daily"
  },
  {
    "id": "parse",
    "type": "function",
    "func": "msg.payload = [{\n  measurement: 'consumption',\n  fields: {\n    value: msg.payload.value,\n    hc: msg.payload.hc,\n    hp: msg.payload.hp\n  },\n  tags: {\n    pdl: msg.payload.pdl\n  }\n}];\nreturn msg;"
  },
  {
    "id": "influxdb_out",
    "type": "influxdb out",
    "database": "energy"
  }
]
```

## InfluxDB + Grafana

### Configuration InfluxDB

```yaml
influxdb:
  enabled: true
  url: "http://influxdb:8086"
  token: "your-token"
  org: "myorg"
  bucket: "myelectricaldata"

  # Mapping des mesures
  measurements:
    consumption: "electricity_consumption"
    production: "electricity_production"
    power: "electricity_power"
```

### Docker Compose

```yaml
services:
  myelectricaldata:
    image: myelectricaldata/local-client:latest
    environment:
      - INFLUXDB_ENABLED=true
      - INFLUXDB_URL=http://influxdb:8086
      - INFLUXDB_TOKEN=your-token
      - INFLUXDB_ORG=myorg
      - INFLUXDB_BUCKET=myelectricaldata

  influxdb:
    image: influxdb:2
    ports:
      - "8086:8086"
    volumes:
      - influxdb_data:/var/lib/influxdb2
    environment:
      - DOCKER_INFLUXDB_INIT_MODE=setup
      - DOCKER_INFLUXDB_INIT_USERNAME=admin
      - DOCKER_INFLUXDB_INIT_PASSWORD=password
      - DOCKER_INFLUXDB_INIT_ORG=myorg
      - DOCKER_INFLUXDB_INIT_BUCKET=myelectricaldata

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
```

### Requêtes Flux (InfluxDB 2.x)

```flux
// Consommation journalière sur 30 jours
from(bucket: "myelectricaldata")
  |> range(start: -30d)
  |> filter(fn: (r) => r._measurement == "electricity_consumption")
  |> filter(fn: (r) => r._field == "daily")
  |> aggregateWindow(every: 1d, fn: last)

// Comparaison HC/HP
from(bucket: "myelectricaldata")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "electricity_consumption")
  |> filter(fn: (r) => r._field == "hc" or r._field == "hp")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

## API REST locale

Le client expose une API REST complète pour des intégrations personnalisées.

### Endpoints disponibles

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/status` | Statut du client |
| GET | `/api/pdl` | Liste des PDL |
| GET | `/api/pdl/{pdl}` | Informations d'un PDL |
| GET | `/api/consumption/daily` | Consommation journalière |
| GET | `/api/consumption/detailed` | Consommation 30 min |
| GET | `/api/production/daily` | Production journalière |
| GET | `/api/production/detailed` | Production 30 min |
| POST | `/api/sync` | Forcer une synchronisation |
| GET | `/health` | Health check |

### Exemples

```bash
# Statut
curl http://localhost:8080/api/status

# Consommation du jour
curl http://localhost:8080/api/consumption/daily

# Consommation sur une période
curl "http://localhost:8080/api/consumption/daily?start=2024-01-01&end=2024-01-31"

# Forcer sync
curl -X POST http://localhost:8080/api/sync
```

### Authentification (optionnelle)

```yaml
api:
  auth:
    enabled: true
    token: "votre_token_secret"
```

```bash
curl -H "Authorization: Bearer votre_token_secret" http://localhost:8080/api/status
```

## Webhooks

Le client peut envoyer des webhooks lors d'événements.

### Configuration

```yaml
webhooks:
  enabled: true

  endpoints:
    - url: "https://webhook.example.com/linky"
      events:
        - sync_complete
        - sync_error
        - high_consumption
      secret: "webhook_secret"  # Pour la signature HMAC
```

### Payload

```json
{
  "event": "sync_complete",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "pdl": "12345678901234",
    "consumption_daily": 15.234,
    "production_daily": 12.8
  },
  "signature": "sha256=..."
}
```

### Exemples d'utilisation

- **IFTTT** : Déclencher des applets
- **Zapier** : Automatiser des workflows
- **n8n** : Orchestrer des actions
- **Make (Integromat)** : Créer des scénarios

## Intégrations supplémentaires

### ESPHome (ESP32/ESP8266)

Récupérez les données via MQTT ou REST pour les afficher sur des écrans :

```yaml
# esphome/linky_display.yaml
mqtt:
  broker: your_broker

sensor:
  - platform: mqtt_subscribe
    name: "Consommation Jour"
    topic: "myelectricaldata/+/consumption/daily"
    value_template: "{{ value_json.value }}"
    unit_of_measurement: "kWh"

display:
  - platform: ssd1306_i2c
    lambda: |-
      it.printf(0, 0, "Conso: %.1f kWh", id(consumption).state);
```

### Homebridge (Apple HomeKit)

Utilisez le plugin `homebridge-mqttthing` :

```json
{
  "accessory": "mqttthing",
  "type": "lightSensor",
  "name": "Linky",
  "topics": {
    "getCurrentAmbientLightLevel": "myelectricaldata/+/consumption/daily"
  },
  "minValue": 0,
  "maxValue": 100
}
```

### Homey

Via l'app **MQTT Hub** ou des requêtes HTTP dans les flows.

## Ressources

- [Domoticz Wiki](https://www.domoticz.com/wiki/)
- [OpenHAB Documentation](https://www.openhab.org/docs/)
- [Node-RED Documentation](https://nodered.org/docs/)
- [Gladys Assistant](https://gladysassistant.com/docs/)
- [InfluxDB Documentation](https://docs.influxdata.com/)
