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
  <TabItem value="docker" label="Docker (recommandé)" default>

```bash
# Cloner le repository
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata

# Démarrer les services
make up

# Accéder à l'application
open http://localhost:8000
```

  </TabItem>
  <TabItem value="manual" label="Installation manuelle">

```bash
# Backend (FastAPI)
cd apps/api
uv sync
uv run uvicorn src.main:app --reload

# Frontend (React/Vite)
cd apps/web
npm install
npm run dev
```

  </TabItem>
</Tabs>

## 📚 Documentation

| Section | Description |
|---------|-------------|
| [**Installation**](/setup/docker) | Guides d'installation et de configuration |
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

## 📖 Ressources

- [Guide d'installation Docker](/setup/docker)
- [Configuration de la base de données](/setup/database)
- [Création d'un compte démo](/demo)
- [FAQ](/pages/faq)

## 🤝 Contribution

Le projet est open-source. Consultez le [guide de contribution](/pages/contribute) pour participer.
