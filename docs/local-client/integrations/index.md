# Intégrations

Le mode client de MyElectricalData supporte l'export vers plusieurs plateformes domotiques et de monitoring.

## Destinations disponibles

| Destination | Type | Description |
|-------------|------|-------------|
| [Home Assistant](./home-assistant.md) | Domotique | Plateforme domotique open-source |
| [MQTT](./mqtt.md) | Protocole | Broker de messages IoT |
| [VictoriaMetrics](./victoriametrics.md) | Time-series DB | Base de données métriques |

➡️ Voir aussi : [Autres intégrations planifiées](./autres.md) (Jeedom, InfluxDB, Domoticz...)

## Architecture commune

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUX D'EXPORT                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────┐               │
│  │ PostgreSQL  │────▶│ Exporter    │────▶│ Destination     │               │
│  │ (données)   │     │ Service     │     │ (HA/MQTT/VM)    │               │
│  └─────────────┘     └─────────────┘     └─────────────────┘               │
│                            │                                                │
│                            ▼                                                │
│                      ┌─────────────┐                                        │
│                      │ Export Logs │                                        │
│                      └─────────────┘                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Données exportables

| Donnée | Format | Fréquence |
|--------|--------|-----------|
| Consommation journalière | Wh / kWh | Quotidien |
| Consommation mensuelle | Wh / kWh | Quotidien |
| Production journalière | Wh / kWh | Quotidien |
| Tempo couleur | BLEU/BLANC/ROUGE | Quotidien |
| Tempo J+1 | BLEU/BLANC/ROUGE | Quotidien (après 11h) |
| EcoWatt niveau | 1/2/3 | Horaire |

