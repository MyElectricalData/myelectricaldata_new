---
sidebar_position: 1
slug: /
title: Accueil
---

# MyElectricalData

**Accédez à vos données Linky en toute simplicité**

MyElectricalData est une passerelle API sécurisée qui permet aux particuliers français d'accéder à leurs données de consommation et de production électrique via les API professionnelles Enedis.

## 🚀 Démarrage rapide

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
  <TabItem value="client" label="Mode Client (recommandé)" default>

```bash
# Cloner le repository
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata

# Configurer les identifiants MyElectricalData API
cp .env.client.example .env.client
nano .env.client

# Démarrer les services
docker compose -f docker-compose.client.yml up -d

# Accéder à l'application
open http://localhost:8100
```

  </TabItem>
  <TabItem value="server" label="Mode Serveur">

```bash
# Cloner le repository
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata

# Configurer les identifiants Enedis/RTE
cp apps/api/.env.example apps/api/.env.docker
nano apps/api/.env.docker

# Démarrer les services
docker compose up -d

# Accéder à l'application
open http://localhost:8000
```

  </TabItem>
  <TabItem value="helm" label="Kubernetes (Helm)">

```bash
# Mode Client
helm install myelectricaldata ./helm/myelectricaldata-client \
  --set secrets.med.clientId.value=xxx \
  --set secrets.med.clientSecret.value=xxx

# Mode Serveur
helm install myelectricaldata ./helm/myelectricaldata-server \
  --set secrets.enedis.clientId.value=xxx \
  --set secrets.enedis.clientSecret.value=xxx
```

  </TabItem>
</Tabs>

## 📚 Documentation

| Section | Description |
|---------|-------------|
| [**Guide d'installation**](/setup/installation) | Choisir entre Docker ou Helm, mode Client ou Serveur |
| [**Docker Compose**](/setup/docker) | Installation Docker pour les deux modes |
| [**Helm Charts**](/setup/helm) | Déploiement Kubernetes |
| [**Client Local**](/local-client) | Client domotique pour Home Assistant, MQTT, Jeedom, etc. |
| [**Fonctionnalités**](/features-spec/simulator) | Spécifications des fonctionnalités |
| [**Architecture**](/architecture/summary) | Vue d'ensemble technique et [chiffrement](/architecture/encryption) |
| [**Design System**](/design) | Règles de design et composants UI |
| [**API**](/enedis-api/endpoint) | Documentation des API Enedis et RTE |

## ✨ Fonctionnalités principales

### 📊 Consultation des données
- **Consommation** : Visualisez votre consommation quotidienne, mensuelle et annuelle
- **Production** : Suivez votre production solaire (si applicable)
- **Puissance max** : Analysez vos pics de puissance

### 💰 Simulateur de tarifs
- Comparez les offres **BASE**, **HC/HP** et **TEMPO**
- Calcul basé sur votre consommation réelle
- Support de 130+ offres de 4 fournisseurs

### 📅 Données TEMPO & Ecowatt
- Couleurs des jours TEMPO (bleu, blanc, rouge)
- Alertes Ecowatt pour les tensions réseau
- Historique et prévisions

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  Enedis API │
│  React/Vite │     │   FastAPI   │     │  DataHub    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │    Cache    │
                    │   (Redis)   │
                    └─────────────┘
```

- **Frontend** : React 18 + TypeScript + Vite + TailwindCSS
- **Backend** : FastAPI + SQLAlchemy + Pydantic
- **Base de données** : PostgreSQL ou SQLite
- **Cache** : Redis avec chiffrement Fernet

## 🔐 Sécurité

- **Isolation des données** : Chaque utilisateur n'accède qu'à ses propres PDL
- **[Chiffrement Fernet](/architecture/encryption)** : Données en cache chiffrées avec la clé secrète de l'utilisateur
- **OAuth2** : Flux de consentement Enedis sécurisé
- **Rate limiting** : Protection contre les abus

## 🏠 Client Local (domotique)

Installez le **Client Local** chez vous pour intégrer vos données Linky dans votre système domotique :

- **Home Assistant** : Energy Dashboard, entités automatiques
- **MQTT** : Compatible avec tout broker MQTT
- **VictoriaMetrics** : Métriques Prometheus pour Grafana

➡️ [Documentation du Client Local](/local-client)

## 📖 Ressources

- [Guide d'installation](/setup/installation)
- [Installation Docker](/setup/docker)
- [Installation Helm (Kubernetes)](/setup/helm)
- [Configuration de la base de données](/setup/database)
- [Client Local domotique](/local-client)
- [Création d'un compte démo](/demo)
- [FAQ](/pages/faq)

## 🤝 Contribution

Le projet est open-source. Consultez le [guide de contribution](/pages/contribute) pour participer.
