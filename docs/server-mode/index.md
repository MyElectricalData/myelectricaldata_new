---
sidebar_position: 1
---

# Mode Serveur

## Vue d'ensemble

Le **mode serveur** de MyElectricalData est la version complète de l'application, conçue pour fonctionner comme une passerelle (gateway) multi-utilisateurs. Contrairement au mode client (installation locale), le mode serveur :

- **Se connecte directement aux API Enedis** (DataHub) et RTE
- **Gère l'authentification OAuth2** avec consentement utilisateur
- **Supporte plusieurs utilisateurs** avec isolation des données
- **Offre une administration complète** (utilisateurs, rôles, logs, offres)
- **Utilise un cache Valkey** (24h) au lieu du stockage permanent

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
│    ┌────┴────┐                                 ▼                            │
│    │         │                         ┌─────────────────────┐              │
│    ▼         ▼                         │ API MyElectricalData│              │
│ ┌───────┐ ┌───────┐                    │ v2.myelectricaldata │              │
│ │Enedis │ │  RTE  │                    └─────────────────────┘              │
│ │DataHub│ │  API  │                                                         │
│ └───────┘ └───────┘                                                         │
│                                                                             │
│  Cache : Valkey (24h)                   Cache : Non                         │
│  Admin : Oui                            Admin : Non                         │
│  Multi-users : Oui                      Multi-users : Non                   │
│  Page accueil : Oui                     Page accueil : Non                  │
│  Exports : Non                          Exports : HA/MQTT/VM                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Fonctionnalités

### Pages disponibles

| Page | Description | Source de données |
|------|-------------|-------------------|
| **Accueil (Landing)** | Présentation et inscription | - |
| **Inscription/Connexion** | Authentification utilisateur | PostgreSQL |
| **Dashboard** | Vue d'ensemble des PDL | API Enedis |
| **Consommation (kWh)** | Données de consommation | API Enedis → Cache |
| **Consommation (Euro)** | Coûts calculés | Cache + Offres tarifaires |
| **Production** | Données de production | API Enedis → Cache |
| **Bilan** | Synthèse conso/prod | Cache |
| **Contribution** | Envoi de contributions | PostgreSQL |
| **Tempo** | Calendrier RTE Tempo | API RTE → Cache |
| **EcoWatt** | Alertes RTE EcoWatt | API RTE → Cache |
| **France** | Consommation nationale | API RTE → Cache |
| **Simulateur** | Comparaison tarifs | Cache + Offres |
| **FAQ** | Questions fréquentes | Statique |
| **Paramètres** | Configuration compte | PostgreSQL |

### Pages d'administration

| Page | Description |
|------|-------------|
| **Admin Dashboard** | Vue d'ensemble système |
| **Utilisateurs** | Gestion des comptes |
| **Rôles** | Gestion des permissions |
| **PDL** | Ajout/gestion des PDL |
| **Offres** | Gestion fournisseurs énergie |
| **Tempo** | Gestion calendrier Tempo |
| **EcoWatt** | Gestion alertes EcoWatt |
| **Contributions** | Modération des contributions |
| **Logs** | Journaux d'activité |

---

## Prérequis

### Techniques

- Docker & Docker Compose
- PostgreSQL 15+
- Valkey (Redis compatible)

### Credentials API

| API | Requis | Obtention |
|-----|--------|-----------|
| **Enedis DataHub** | Oui | [Portail Enedis](https://datahub-enedis.fr) (compte pro requis) |
| **RTE Tempo** | Optionnel | [API RTE](https://data.rte-france.com) |
| **RTE EcoWatt** | Optionnel | [API RTE](https://data.rte-france.com) |

---

## Installation rapide

```bash
# Cloner le dépôt
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata

# Configurer les variables d'environnement
cp apps/api/.env.example apps/api/.env.docker
vim apps/api/.env.docker

# Démarrer le mode serveur
docker compose up -d
```

**Accès** : http://localhost:8000

---

## Coexistence avec le mode client

Les deux modes peuvent tourner en parallèle sur la même machine :

| Mode | Frontend | Backend | PostgreSQL | Valkey |
|------|----------|---------|------------|--------|
| Serveur | :8000 | :8081 | :5432 | :6379 |
| Client | :8100 | :8181 | :5433 | - |

```bash
# Démarrer les deux modes simultanément
docker compose -f docker-compose.server.yml up -d # Mode serveur
docker compose up -d                              # Mode client
```

---

## Documentation

### Installation

- [Installation Docker](./installation/docker.md)
- [Installation Helm (Kubernetes)](./installation/helm.md)
- [Prérequis et configuration](./installation/index.md)

### Architecture

- [Architecture technique](./architecture.md)
- [Authentification OAuth2](./authentication.md)
- [Cache et chiffrement](./cache.md)

### Administration

- [Gestion des utilisateurs](./administration/users.md)
- [Gestion des offres tarifaires](./administration/offers.md)
- [Logs et monitoring](./administration/logs.md)

### API

- [Documentation API Enedis](/enedis-api/endpoint)
- [Documentation API RTE](/external-apis/rte-api)
