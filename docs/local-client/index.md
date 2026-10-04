# Mode Client Local

## Vue d'ensemble

Le **mode client** de MyElectricalData est une version allégée de l'application, conçue pour tourner localement chez l'utilisateur final. Contrairement au mode serveur (gateway complet), le mode client :

- **Se connecte à l'API MyElectricalData** (www.v2.myelectricaldata.fr) au lieu d'Enedis directement
- **Stocke les données indéfiniment** en base PostgreSQL locale
- **Ne nécessite pas de compte Enedis professionnel**
- **Propose des exports vers Home Assistant, MQTT, VictoriaMetrics, Jeedom**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ARCHITECTURE COMPARÉE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MODE SERVEUR (Gateway)                 MODE CLIENT (Local)                 │
│  ━━━━━━━━━━━━━━━━━━━━━━                 ━━━━━━━━━━━━━━━━━━━━                │
│                                                                             │
│  ┌─────────────┐                        ┌─────────────┐                     │
│  │   Frontend  │                        │   Frontend  │                     │
│  │   (React)   │                        │   (React)   │                     │
│  └──────┬──────┘                        └──────┬──────┘                     │
│         │                                      │                            │
│         ▼                                      ▼                            │
│  ┌─────────────┐                        ┌─────────────┐                     │
│  │   Backend   │                        │   Backend   │                     │
│  │  (FastAPI)  │                        │  (FastAPI)  │                     │
│  └──────┬──────┘                        └──────┬──────┘                     │
│         │                                      │                            │
│         ▼                                      ▼                            │
│  ┌─────────────┐                        ┌─────────────────────┐             │
│  │  Enedis API │                        │ API MyElectricalData│             │
│  │  (direct)   │                        │ v2.myelectricaldata │             │
│  └─────────────┘                        └─────────────────────┘             │
│                                                │                            │
│  Cache : Valkey (24h)                          ▼                            │
│  Admin : Oui                           ┌─────────────┐                      │
│  Page accueil : Oui                    │ PostgreSQL  │                      │
│                                        │  (indéfini) │                      │
│                                        └──────┬──────┘                      │
│                                               │                             │
│                                               ▼                             │
│                                        ┌─────────────┐                      │
│                                        │  Exporters  │                      │
│                                        │ HA/MQTT/VM  │                      │
│                                        └─────────────┘                      │
│                                                                             │
│                                        Cache : Non                          │
│                                        Admin : Non                          │
│                                        Page accueil : Non                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Fonctionnalités

### Pages disponibles

| Page | Description | Source de données |
|------|-------------|-------------------|
| **Dashboard** | Vue d'ensemble des PDL | API v2.myelectricaldata.fr |
| **Consommation (kWh)** | Données de consommation | API → PostgreSQL local |
| **Consommation (Euro)** | Coûts calculés | PostgreSQL local |
| **Production** | Données de production | API → PostgreSQL local |
| **Bilan** | Synthèse conso/prod | PostgreSQL local |
| **Contribution** | Envoi de contributions | API v2.myelectricaldata.fr |
| **Tempo** | Calendrier RTE Tempo | API → PostgreSQL local |
| **EcoWatt** | Alertes RTE EcoWatt | API → PostgreSQL local |
| **Exporter** | Configuration exports | Local uniquement |

### Pages supprimées (vs mode serveur)

- Page d'accueil (landing)
- Inscription / Connexion
- Administration (users, rôles, logs, offres)
- Paramètres avancés

### Exports disponibles

| Destination | Description |
|-------------|-------------|
| **Home Assistant** | Intégration directe via REST API |
| **MQTT** | Publication vers broker MQTT |
| **VictoriaMetrics** | Push vers base time-series |

➡️ [Voir les intégrations planifiées](./integrations/autres.md) (Jeedom, InfluxDB, Domoticz...)

---

## Prérequis

- Docker & Docker Compose
- Compte sur www.v2.myelectricaldata.fr avec PDL autorisé
- Client ID et Client Secret de l'API MyElectricalData

---

## Installation rapide

```bash
# Cloner le dépôt
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata

# Configurer les variables d'environnement
cp .env.local-client.example .env.local-client

# Éditer .env.local-client avec vos credentials API
vim .env.local-client

# Démarrer le mode client
docker compose up -d
```

**Accès** : http://localhost:8100 (port différent du mode serveur)

---

## Coexistence avec le mode serveur

Les deux modes peuvent tourner en parallèle sur la même machine :

| Mode | Frontend | Backend | PostgreSQL |
|------|----------|---------|------------|
| Serveur | :8000 | :8081 | :5432 (interne) |
| Client | :8100 | :8181 | :5433 (interne) |

```bash
# Démarrer les deux modes simultanément
docker compose -f docker-compose.server.yml up -d    # Mode serveur
docker compose up -d                                  # Mode client
```

---

## Compatibilité avec la passerelle (Enedis Data Connect 2026)

Depuis la migration vers les API Enedis Data Connect 2026, la passerelle `v2.myelectricaldata.fr` rend les mesures, le contrat et l'adresse au nouveau format (`grandeur[].points[]` au lieu de `meter_reading.interval_reading[]`). Conséquences :

- un client local **antérieur** à cette version ne sait plus lire les réponses de la passerelle : il faut le mettre à jour ;
- un client local **à jour** lit aussi une passerelle encore en v5, l'ordre de mise à jour est donc libre ;
- les données déjà synchronisées en base (`raw_data` au format v5) sont gardées et restent lues, sans migration.

Détail du format : [Data Connect 2026](../external-apis/enedis-api/data-connect-2026/README.md).

## Documentation

- [Installation](./installation/) (Docker, Helm)
- [Architecture technique](./architecture.md)
- [Configuration](./configuration.md)
- [Page Exporter](./exporters.md)
- [Interface utilisateur](./interface.md)

### Intégrations

- [Home Assistant](./integrations/home-assistant.md)
- [MQTT](./integrations/mqtt.md)
- [VictoriaMetrics](./integrations/victoriametrics.md)
- [Autres intégrations planifiées](./integrations/autres.md) (Jeedom, InfluxDB...)
