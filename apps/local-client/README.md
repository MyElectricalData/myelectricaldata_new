# MyElectricalData Local Client

Client local pour synchroniser et exporter les données Linky vers différentes plateformes domotiques.

## Fonctionnalités

- Synchronisation automatique avec l'API MyElectricalData
- Export vers Home Assistant (MQTT Discovery)
- Export vers MQTT générique
- Métriques Prometheus/VictoriaMetrics
- Intégration Jeedom
- Interface web de configuration

## Installation

```bash
# Avec Docker (recommandé)
make local-client

# Manuellement
cd apps/local-client
uv sync
uv run python -m src.main run
```

## Configuration

Voir `.env.example` ou `config.example.yaml` pour les options de configuration.

## Ports

- `8080` : Interface web
- `9090` : Métriques Prometheus
