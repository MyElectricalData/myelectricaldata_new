---
sidebar_position: 1
title: Home Assistant
---

# Intégration Home Assistant

Le client local s'intègre nativement avec Home Assistant pour exposer vos données Linky dans le **Energy Dashboard** et créer des cartes personnalisées.

## Méthodes d'intégration

### 1. Add-on Home Assistant (Recommandé)

Pour Home Assistant OS ou Supervised :

1. Ajoutez le dépôt : `https://github.com/MyElectricalData/ha-addons`
2. Installez **MyElectricalData Local Client**
3. Configurez vos identifiants
4. Les entités sont créées automatiquement

### 2. Container Docker externe

Si vous utilisez Home Assistant Container ou Core :

```yaml
# docker-compose.yml
services:
  myelectricaldata:
    image: myelectricaldata/local-client:latest
    environment:
      - CLIENT_ID=votre_client_id
      - CLIENT_SECRET=votre_client_secret
      - HA_ENABLED=true
      - HA_DISCOVERY=true
      - MQTT_ENABLED=true
      - MQTT_HOST=votre_broker_mqtt
    volumes:
      - ./data:/data
```

## Configuration MQTT Discovery

Le client utilise [MQTT Discovery](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery) pour créer automatiquement les entités.

### Prérequis

1. **Broker MQTT** configuré dans Home Assistant (Mosquitto add-on ou externe)
2. **MQTT Discovery** activé (par défaut)

### Configuration du client

```yaml
home_assistant:
  enabled: true
  discovery: true
  discovery_prefix: "homeassistant"  # Préfixe par défaut de HA
  entity_prefix: "myelectricaldata"
  energy_dashboard: true
  statistics: true

mqtt:
  enabled: true
  host: "core-mosquitto"  # Nom du add-on Mosquitto
  # ou IP de votre broker externe
  port: 1883
  username: "mqtt_user"
  password: "mqtt_password"
```

## Entités créées

Le client crée automatiquement les entités suivantes pour chaque PDL :

### Sensors de consommation

| Entité | Type | Unité | Description |
|--------|------|-------|-------------|
| `sensor.med_{pdl}_consumption_daily` | `sensor` | kWh | Consommation du jour |
| `sensor.med_{pdl}_consumption_yesterday` | `sensor` | kWh | Consommation d'hier |
| `sensor.med_{pdl}_consumption_month` | `sensor` | kWh | Consommation du mois |
| `sensor.med_{pdl}_consumption_year` | `sensor` | kWh | Consommation de l'année |
| `sensor.med_{pdl}_max_power` | `sensor` | kVA | Puissance max du jour |

### Sensors de production (si applicable)

| Entité | Type | Unité | Description |
|--------|------|-------|-------------|
| `sensor.med_{pdl}_production_daily` | `sensor` | kWh | Production du jour |
| `sensor.med_{pdl}_production_yesterday` | `sensor` | kWh | Production d'hier |
| `sensor.med_{pdl}_production_month` | `sensor` | kWh | Production du mois |
| `sensor.med_{pdl}_production_year` | `sensor` | kWh | Production de l'année |

### Sensors de statut

| Entité | Type | Description |
|--------|------|-------------|
| `sensor.med_{pdl}_last_sync` | `timestamp` | Dernière synchronisation |
| `binary_sensor.med_{pdl}_sync_status` | `binary_sensor` | État de la sync (ok/erreur) |

### Attributs des sensors

Chaque sensor de consommation/production inclut des attributs :

```yaml
# Exemple: sensor.med_12345678901234_consumption_daily
state: 15.234
attributes:
  unit_of_measurement: kWh
  device_class: energy
  state_class: total_increasing
  last_updated: "2024-01-15T10:30:00Z"
  pdl: "12345678901234"
  tariff: "BASE"
  # Pour HC/HP
  hc: 8.5
  hp: 6.734
```

## Configuration Energy Dashboard

### Activation automatique

Avec `energy_dashboard: true`, les sensors sont configurés avec les bonnes `device_class` et `state_class` pour être compatibles avec le Energy Dashboard.

### Configuration manuelle

1. Allez dans **Paramètres** → **Tableaux de bord** → **Énergie**
2. Dans **Consommation électrique**, ajoutez :
   - `sensor.med_{pdl}_consumption_daily`
3. Dans **Production solaire** (si applicable) :
   - `sensor.med_{pdl}_production_daily`

### Statistiques long terme

Le client publie des statistiques compatibles avec le [Long-term Statistics](https://www.home-assistant.io/integrations/recorder/#statistics) de Home Assistant :

```yaml
home_assistant:
  statistics: true
```

Cela permet :
- Historique illimité dans le Energy Dashboard
- Graphiques sur plusieurs années
- Comparaisons mensuelles/annuelles

## Cartes Lovelace

### Carte énergie simple

```yaml
type: energy-distribution
link_dashboard: true
```

### Carte personnalisée avec Gauge

```yaml
type: gauge
entity: sensor.med_12345678901234_consumption_daily
name: Consommation du jour
min: 0
max: 50
severity:
  green: 0
  yellow: 20
  red: 35
```

### Carte historique

```yaml
type: history-graph
entities:
  - entity: sensor.med_12345678901234_consumption_daily
    name: Consommation
  - entity: sensor.med_12345678901234_production_daily
    name: Production
hours_to_show: 168  # 7 jours
```

### Carte ApexCharts (recommandée)

Installez [ApexCharts Card](https://github.com/RomRider/apexcharts-card) via HACS :

```yaml
type: custom:apexcharts-card
header:
  show: true
  title: Consommation électrique
  show_states: true
  colorize_states: true
graph_span: 30d
span:
  end: day
series:
  - entity: sensor.med_12345678901234_consumption_daily
    name: Consommation
    type: column
    color: "#3b82f6"
    group_by:
      func: last
      duration: 1d
  - entity: sensor.med_12345678901234_production_daily
    name: Production
    type: column
    color: "#22c55e"
    group_by:
      func: last
      duration: 1d
```

### Carte avec détail HC/HP

```yaml
type: custom:apexcharts-card
header:
  show: true
  title: Consommation HC/HP
graph_span: 7d
series:
  - entity: sensor.med_12345678901234_consumption_daily
    name: Heures Creuses
    type: column
    color: "#3b82f6"
    data_generator: |
      return entity.attributes.hc_history.map((val, index) => {
        return [new Date(entity.attributes.dates[index]).getTime(), val];
      });
  - entity: sensor.med_12345678901234_consumption_daily
    name: Heures Pleines
    type: column
    color: "#ef4444"
    data_generator: |
      return entity.attributes.hp_history.map((val, index) => {
        return [new Date(entity.attributes.dates[index]).getTime(), val];
      });
```

## Automatisations

### Notification de consommation élevée

```yaml
automation:
  - alias: "Alerte consommation élevée"
    trigger:
      - platform: numeric_state
        entity_id: sensor.med_12345678901234_consumption_daily
        above: 30
    action:
      - service: notify.notify
        data:
          title: "Consommation électrique élevée"
          message: >
            Votre consommation du jour est de
            {{ states('sensor.med_12345678901234_consumption_daily') }} kWh
```

### Rapport hebdomadaire

```yaml
automation:
  - alias: "Rapport hebdomadaire consommation"
    trigger:
      - platform: time
        at: "08:00:00"
    condition:
      - condition: time
        weekday:
          - mon
    action:
      - service: notify.notify
        data:
          title: "Rapport hebdomadaire"
          message: >
            Consommation de la semaine :
            {{ states('sensor.med_12345678901234_consumption_week') }} kWh
```

## Dépannage

### Les entités n'apparaissent pas

1. Vérifiez que MQTT Discovery est activé dans Home Assistant
2. Vérifiez les logs du client :
   ```bash
   docker logs myelectricaldata-client
   ```
3. Vérifiez les messages MQTT :
   ```bash
   mosquitto_sub -h localhost -t "homeassistant/#" -v
   ```

### Données non mises à jour

1. Vérifiez le statut de synchronisation :
   ```bash
   curl http://localhost:8080/api/status
   ```
2. Forcez une synchronisation :
   ```bash
   curl -X POST http://localhost:8080/api/sync
   ```

### Energy Dashboard ne montre pas les données

1. Vérifiez que `state_class: total_increasing` est présent
2. Attendez quelques heures (HA accumule les données)
3. Vérifiez dans **Outils de développement** → **Statistiques**

## Ressources

- [Documentation officielle Home Assistant Energy](https://www.home-assistant.io/docs/energy/)
- [MQTT Discovery](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery)
- [Long-term Statistics](https://www.home-assistant.io/integrations/recorder/#statistics)
