# MyElectricalData

Une passerelle API permettant aux particuliers d'accéder à leurs données Linky via les API professionnelles Enedis.

## 🎯 Objectif

Les API Enedis sont réservées aux professionnels disposant d'un SIRET. MyElectricalData agit comme une passerelle sécurisée permettant aux particuliers d'accéder à leurs propres données de consommation électrique.

## ✨ Fonctionnalités

- 🔐 **Consentement Enedis au niveau compte** : Un seul consentement pour accéder à tous vos PDL
- 🔄 **Détection automatique des PDL** : Vos points de livraison sont automatiquement récupérés après consentement
- 🔒 **Cache chiffré** : Données mises en cache avec chiffrement par `client_secret` utilisateur
- ⚡ **Rate limiting** : Respect des quotas Enedis (5 requêtes/seconde) + quotas utilisateurs
- 🛡️ **Isolation totale** : Chaque utilisateur n'accède qu'à ses propres données
- 📊 **API complète** : Miroir de tous les endpoints Enedis (consommation, production, contrat, etc.)
- 👨‍💼 **Panel Admin** : Gestion des utilisateurs, statistiques et reset de quotas
- 🔑 **OAuth2 Client Credentials** : Authentification sécurisée avec `client_id` / `client_secret`
- 🗄️ **Multi-database** : Support SQLite et PostgreSQL avec auto-détection

## Project Structure

```text
myelectricaldata_new/
├── apps/
│   ├── api/          # FastAPI backend
│   └── web/          # React + Vite frontend
└── docker-compose.yml
```

## Running with Docker

The easiest way to run the entire application is using Docker Compose.

### Prerequisites

- Docker
- Docker Compose

### Quick Start

1. **Configure environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Build the containers**:

   ```bash
   docker compose build
   ```

3. **Start the services**:

   ```bash
   docker compose up
   ```

   Or run in detached mode:

   ```bash
   docker compose up -d
   ```

4. **Access the applications**:
   - API: <http://localhost:8000>
   - API Documentation: <http://localhost:8000/docs>
   - Web UI: <http://localhost:3000>

## 🌐 Production Deployment

For production on <https://myelectricaldata.fr>:

1. **Configure environment variables**:

   ```bash
   # Backend (.env)
   FRONTEND_URL=https://myelectricaldata.fr
   BACKEND_URL=https://myelectricaldata.fr/api
   ENEDIS_REDIRECT_URI=https://myelectricaldata.fr/oauth/callback
   ENEDIS_ENVIRONMENT=production
   DEBUG=false

   # Frontend (.env)
   VITE_API_BASE_URL=https://myelectricaldata.fr/api
   ```

2. **Setup Nginx reverse proxy** (see `nginx.conf.example`):

   - Frontend: Serve React static files at `/`
   - Backend: Reverse proxy to FastAPI at `/api`

3. **SSL/TLS**: Use Let's Encrypt for HTTPS certificates

4. **Build frontend**:

   ```bash
   cd apps/web
   npm run build
   # Deploy dist/ to /var/www/myelectricaldata/web
   ```

5. **Run backend**:

   ```bash
   cd apps/api
   uv run uvicorn src.main:app --host 127.0.0.1 --port 8000
   ```

## 🚀 Parcours utilisateur

1. **Création de compte** : Inscription avec email/mot de passe
2. **Consentement Enedis** : Clic sur "Consentement Enedis" depuis le tableau de bord
3. **Détection automatique** : Tous les PDL du compte Enedis sont récupérés et créés automatiquement
4. **Accès aux données** : Utilisation des identifiants API (`client_id` / `client_secret`) pour récupérer les données

### Docker Commands

- **View logs**:

  ```bash
  docker compose logs -f
  ```

- **View logs for specific service**:

  ```bash
  docker compose logs -f api
  docker compose logs -f web
  ```

- **Stop the services**:

  ```bash
  docker compose down
  ```

- **Rebuild after changes**:

  ```bash
  docker compose up --build
  ```

- **Remove all containers and volumes**:

  ```bash
  docker compose down -v
  ```

## Development

### API (FastAPI)

Located in `apps/api/`. See [apps/api/README.md](apps/api/README.md) for detailed documentation.

### Web (React + Vite)

Located in `apps/web/`. See [apps/web/README.md](apps/web/README.md) for detailed documentation.

## Configuration

Configuration is managed through environment variables. Copy `.env.example` to `.env` and adjust values as needed:

### Backend (API)

- `DATABASE_URL`: URL de connexion à la base de données (SQLite ou PostgreSQL, auto-détecté)
- `REDIS_URL`: Valkey cache URL (Redis-compatible protocol)
- `ENEDIS_CLIENT_ID`: Client ID fourni par Enedis
- `ENEDIS_CLIENT_SECRET`: Client secret fourni par Enedis
- `ENEDIS_ENVIRONMENT`: `sandbox` ou `production`
- `ENEDIS_REDIRECT_URI`: URL de callback OAuth Enedis
- `SECRET_KEY`: Clé secrète pour JWT
- `CACHE_TTL_SECONDS`: Durée de vie du cache (défaut: 86400 = 24h)
- `USER_DAILY_LIMIT_NO_CACHE`: Quota journalier sans cache (défaut: 50)
- `USER_DAILY_LIMIT_WITH_CACHE`: Quota journalier avec cache (défaut: 1000)
- `ADMIN_EMAILS`: Adresses email des administrateurs (séparées par des virgules)
- `FRONTEND_URL`: URL du frontend (production: <https://myelectricaldata.fr>)
- `BACKEND_URL`: URL du backend (production: <https://myelectricaldata.fr/api>)

### Frontend (Web)

- `VITE_API_BASE_URL`: URL de l'API backend
  - Production: `https://myelectricaldata.fr/api`
  - Development: `http://localhost:8000`

## 🔒 Sécurité

- **Isolation des données** : Chaque utilisateur ne peut accéder qu'à ses propres PDL
- **Vérification de propriété** : Tous les endpoints vérifient que le PDL appartient à l'utilisateur
- **Cache chiffré** : Données chiffrées avec Fernet utilisant le `client_secret` comme clé
- **Tokens OAuth** : Gestion automatique du refresh des tokens Enedis
- **Cascade delete** : Suppression compte → suppression PDL, tokens et cache

Voir [SECURITY.md](apps/api/SECURITY.md) pour plus de détails.

## 📚 Documentation

### 🖥️ Mode Client (Domotique)

- [Documentation Client](docs/local-client/) : Installation locale mono-utilisateur
- [Installation Docker](docs/local-client/installation/docker.md) : Docker Compose
- [Installation Helm](docs/local-client/installation/helm.md) : Kubernetes/Helm
- [Intégrations](docs/local-client/integrations/) : Home Assistant, MQTT, VictoriaMetrics

### 🌐 Mode Serveur (Gateway)

- [Documentation Serveur](docs/server-mode/) : Gateway multi-utilisateurs
- [Installation Docker](docs/server-mode/installation/docker.md) : Docker Compose
- [Installation Helm](docs/server-mode/installation/helm.md) : Kubernetes/Helm
- [Administration](docs/server-mode/administration/) : Users, Offers, Logs, Database, Slack

### 📋 Spécifications Fonctionnelles

- [Account Management](docs/features-spec/account.md) : Gestion des comptes et authentification
- [API Gateway](docs/features-spec/gateway.md) : Passerelle API et consentement Enedis
- [Cache System](docs/features-spec/cache.md) : Système de cache et rate limiting
- [Database](docs/features-spec/database.md) : Support multi-database (SQLite/PostgreSQL)

### 🏗️ Architecture

- [Architecture Summary](docs/architecture/summary.md) : Vue d'ensemble de l'architecture
- [Design System](docs/design/README.md) : Guide de design des composants UI

### 📖 APIs Externes

- [APIs Externes](docs/external-apis/) : Vue d'ensemble Enedis et RTE
- [API Enedis DataHub](docs/enedis-api/) : Documentation complète Enedis
- [API RTE](docs/rte-api/) : Tempo, EcoWatt, Consumption, Generation Forecast
- [API EDF Zen Flex](docs/external-apis/edf-zen-flex.md) : calendrier des jours Éco, Sobriété et Bonus

### Autres

- [API Security](apps/api/SECURITY.md) : Sécurité et isolation des données
- **API Documentation** : Swagger UI disponible à `/docs` avec support OAuth2 Client Credentials

## Health Checks

Both services include health checks:

- API health: `curl http://localhost:8000/ping`
- Web health: `curl http://localhost:3000`
