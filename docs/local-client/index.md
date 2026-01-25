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
cp .env.client.example .env.client

# Éditer .env.client avec vos credentials API
vim .env.client

# Démarrer le mode client
docker compose -f docker-compose.client.yml up -d
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
docker compose -f docker-compose.yml up -d           # Mode serveur
docker compose -f docker-compose.client.yml up -d    # Mode client
```

---

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
