---
sidebar_position: 1
title: Client Local
---

# Client Local MyElectricalData

Le **Client Local** est une application légère conçue pour être installée directement chez vous. Elle récupère vos données de consommation et production électrique via la passerelle MyElectricalData et les expose vers vos solutions domotiques préférées.

## Cas d'usage

- **Suivi énergétique** : Visualisez votre consommation/production dans Home Assistant, Jeedom, etc.
- **Historisation locale** : Stockez vos données chez vous, en toute autonomie
- **Intégration domotique** : Automatisez en fonction de votre consommation réelle
- **Métriques avancées** : Exportez vers Prometheus/VictoriaMetrics pour des dashboards personnalisés

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Votre Réseau Local                       │
│                                                             │
│  ┌──────────────┐     ┌─────────────────────────────────┐  │
│  │   Client     │────▶│     Passerelle                  │  │
│  │   Local      │◀────│   MyElectricalData (cloud)      │  │
│  │              │     └─────────────────────────────────┘  │
│  │  SQLite/     │                                          │
│  │  PostgreSQL/ │     ┌─────────────────────────────────┐  │
│  │  MySQL       │────▶│  Home Assistant / Jeedom        │  │
│  │              │     └─────────────────────────────────┘  │
│  │              │                                          │
│  │              │     ┌─────────────────────────────────┐  │
│  │              │────▶│  MQTT Broker (Mosquitto, etc.)  │  │
│  │              │     └─────────────────────────────────┘  │
│  │              │                                          │
│  │              │     ┌─────────────────────────────────┐  │
│  │              │────▶│  VictoriaMetrics / Prometheus   │  │
│  └──────────────┘     └─────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Prérequis

1. **Compte MyElectricalData** avec consentement Enedis validé
2. **Identifiants API** : `client_id` et `client_secret` fournis par la passerelle
3. **Environnement d'exécution** : Docker (recommandé) ou Python 3.11+

## Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| **Synchronisation automatique** | Récupération périodique des données via la passerelle |
| **Stockage local** | SQLite (défaut), PostgreSQL ou MySQL |
| **Home Assistant** | Entités sensor pour Energy Dashboard + cartes Lovelace |
| **MQTT** | Publication des données sur topics configurables |
| **VictoriaMetrics** | Export Prometheus metrics pour historisation longue durée |
| **Jeedom** | Plugin dédié avec widgets |
| **API REST locale** | Endpoints pour intégrations personnalisées |

## Démarrage rapide

```bash
# Via Docker (recommandé)
docker run -d \
  --name myelectricaldata-client \
  -e CLIENT_ID=votre_client_id \
  -e CLIENT_SECRET=votre_client_secret \
  -e GATEWAY_URL=https://api.myelectricaldata.fr \
  -v myelectricaldata_data:/data \
  -p 8080:8080 \
  myelectricaldata/local-client:latest
```

## Documentation

| Section | Description |
|---------|-------------|
| [**Installation**](./installation) | Installation Docker et manuelle |
| [**Configuration**](./configuration) | Fichier de configuration détaillé |
| [**Home Assistant**](./integrations/home-assistant) | Intégration Energy Dashboard |
| [**MQTT**](./integrations/mqtt) | Publication vers broker MQTT |
| [**VictoriaMetrics**](./integrations/victoriametrics) | Export métriques Prometheus |
| [**Jeedom**](./integrations/jeedom) | Plugin et configuration |
| [**Autres intégrations**](./integrations/autres) | Domoticz, OpenHAB, etc. |
| [**API locale**](./api) | Référence des endpoints REST |

## Données exposées

Le client local récupère et expose les données suivantes :

### Consommation
- Consommation journalière (kWh)
- Consommation par tranche horaire (30 min)
- Puissance maximale quotidienne (kVA)

### Production (si applicable)
- Production journalière (kWh)
- Production par tranche horaire (30 min)

### Métadonnées
- Informations du PDL (adresse, puissance souscrite)
- Statut du contrat
- Dernière synchronisation
