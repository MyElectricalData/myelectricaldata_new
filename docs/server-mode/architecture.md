---
sidebar_position: 2
---

# Architecture Mode Serveur

## Vue d'ensemble

Le mode serveur adopte une architecture complète avec authentification, cache distribué et accès direct aux APIs Enedis/RTE.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           MODE SERVEUR - ARCHITECTURE                         │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│                        ┌─────────────────────────┐                            │
│                        │      FRONTEND           │                            │
│                        │   React / Vite          │                            │
│                        │   :8000 (prod)          │                            │
│                        └───────────┬─────────────┘                            │
│                                    │                                          │
│                                    ▼                                          │
│                        ┌─────────────────────────┐                            │
│                        │      BACKEND            │                            │
│                        │   FastAPI               │                            │
│                        │   :8081                 │                            │
│                        └───────────┬─────────────┘                            │
│                                    │                                          │
│              ┌─────────────────────┼─────────────────────┐                    │
│              │                     │                     │                    │
│              ▼                     ▼                     ▼                    │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐             │
│   │ Enedis Adapter  │   │ PostgreSQL      │   │ Valkey Cache    │             │
│   │ (DataHub API)   │   │ (utilisateurs,  │   │ (données Enedis │             │
│   │                 │   │  tokens, config)│   │  chiffrées)     │             │
│   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘             │
│            │                     │                     │                      │
│            ▼                     │                     │                      │
│   ┌─────────────────┐            │         ┌──────────┴──────────┐            │
│   │ Enedis DataHub  │            │         │                     │            │
│   │ (API distante)  │            │         ▼                     ▼            │
│   └─────────────────┘            │  ┌───────────┐       ┌───────────┐         │
│                                  │  │ Fernet    │       │ SHA256    │         │
│   ┌─────────────────┐            │  │ Encryption│       │ Key Deriv │         │
│   │ RTE APIs        │            │  └───────────┘       └───────────┘         │
│   │ Tempo / EcoWatt │            │                                            │
│   └─────────────────┘            │                                            │
│                                  │                                            │
│   Background Tasks (APScheduler) │                                            │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │                                            │
│   • Refresh tokens Enedis        │                                            │
│   • Update Tempo calendar        │                                            │
│   • Update EcoWatt signals       │                                            │
│   • Cleanup expired cache        │                                            │
│                                  │                                            │
└──────────────────────────────────┴────────────────────────────────────────────┘
```

---

## Composants

### Frontend (React/Vite)

Pages spécifiques au mode serveur :

- **Page d'accueil (Landing)** : Présentation et call-to-action inscription
- **Inscription/Connexion** : Authentification JWT
- **Routes admin** : Gestion complète du système
- **Paramètres utilisateur** : Gestion compte et tokens
- **Simulateur** : Comparaison d'offres tarifaires

```typescript
// Routes mode serveur
const routes = [
  { path: '/', component: Landing },
  { path: '/signup', component: Signup },
  { path: '/login', component: Login },
  { path: '/dashboard', component: Dashboard },
  { path: '/consumption', component: ConsumptionKwh },
  { path: '/consumption/euro', component: ConsumptionEuro },
  { path: '/production', component: Production },
  { path: '/bilan', component: Bilan },
  { path: '/contribute', component: Contribute },
  { path: '/tempo', component: Tempo },
  { path: '/ecowatt', component: Ecowatt },
  { path: '/france', component: France },
  { path: '/simulator', component: Simulator },
  { path: '/faq', component: FAQ },
  { path: '/settings', component: Settings },
  // Routes admin
  { path: '/admin', component: AdminDashboard },
  { path: '/admin/users', component: AdminUsers },
  { path: '/admin/roles', component: AdminRoles },
  { path: '/admin/pdl', component: AdminPDL },
  { path: '/admin/offers', component: AdminOffers },
  { path: '/admin/tempo', component: AdminTempo },
  { path: '/admin/ecowatt', component: AdminEcowatt },
  { path: '/admin/contributions', component: AdminContributions },
  { path: '/admin/logs', component: AdminLogs },
];
```

### Backend (FastAPI)

#### Structure des routers

```python
# Mode serveur - tous les routers
from routers import (
    accounts,      # Inscription, connexion, gestion compte
    admin,         # Administration système
    pdl,           # CRUD PDL complet
    enedis,        # Accès direct API Enedis
    consumption,   # Données de consommation
    production,    # Données de production
    tempo,         # Calendrier Tempo (API RTE)
    ecowatt,       # Signaux EcoWatt (API RTE)
    consumption_france,  # Consommation nationale
    generation_forecast, # Prévisions production
    contribute,    # Contributions utilisateurs
    simulator,     # Simulateur de tarifs
    energy_offers, # Gestion offres tarifaires
)
```

#### Enedis Adapter

Service pour communiquer avec l'API Enedis DataHub :

```python
# apps/api/src/adapters/enedis.py

class EnedisAdapter:
    """Client pour l'API Enedis DataHub"""

    BASE_URL = "https://ext.prod.api.enedis.fr"

    async def get_consumption_daily(
        self, pdl: str, start: date, end: date, token: str
    ) -> list[ConsumptionReading]:
        """Récupère la consommation journalière"""

    async def get_consumption_load_curve(
        self, pdl: str, start: date, end: date, token: str
    ) -> list[LoadCurveReading]:
        """Récupère la courbe de charge (30 min)"""

    async def get_production_daily(
        self, pdl: str, start: date, end: date, token: str
    ) -> list[ProductionReading]:
        """Récupère la production journalière"""

    async def get_contract(self, pdl: str, token: str) -> Contract:
        """Récupère les informations du contrat"""

    async def get_addresses(self, pdl: str, token: str) -> Address:
        """Récupère les adresses du PDL"""
```

#### Rate Limiting

Protection contre les abus et respect des quotas Enedis :

```python
# Adapter-level rate limiting
RATE_LIMIT = 5  # requêtes par seconde
DAILY_QUOTA = 10000  # requêtes par heure

# User-level quotas
UNCACHED_DAILY_LIMIT = 50    # requêtes non-cachées par jour
CACHED_DAILY_LIMIT = 1000    # requêtes cachées par jour
```

### Base de données PostgreSQL

#### Schéma mode serveur

```sql
-- Utilisateurs
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    client_id VARCHAR(255) UNIQUE NOT NULL,
    client_secret VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Points de Livraison (PDL)
CREATE TABLE pdls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    usage_point_id VARCHAR(14) UNIQUE NOT NULL,
    alias VARCHAR(255),
    has_production BOOLEAN DEFAULT false,
    subscribed_power INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tokens OAuth2 Enedis
CREATE TABLE tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pdl_id UUID REFERENCES pdls(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Rôles utilisateurs
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]'
);

-- Association user-rôles
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Fournisseurs d'énergie
CREATE TABLE energy_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    website VARCHAR(255),
    logo_url VARCHAR(255),
    scraper_urls JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true
);

-- Offres tarifaires
CREATE TABLE energy_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES energy_providers(id),
    name VARCHAR(255) NOT NULL,
    pricing_type VARCHAR(50) NOT NULL,  -- BASE, HCHP, TEMPO
    prices JSONB NOT NULL,
    subscription_price DECIMAL(10,4),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Contributions utilisateurs
CREATE TABLE contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Logs d'activité
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index
CREATE INDEX idx_pdls_user_id ON pdls(user_id);
CREATE INDEX idx_tokens_user_id ON tokens(user_id);
CREATE INDEX idx_tokens_expires_at ON tokens(expires_at);
CREATE INDEX idx_contributions_status ON contributions(status);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);
```

---

## Cache Valkey

### Stratégie de cache

Le mode serveur utilise un cache distribué Valkey avec chiffrement des données utilisateur :

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STRATÉGIE DE CACHE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Clé de cache : consumption:daily:{pdl}:{date}                              │
│  TTL : 24 heures                                                            │
│  Chiffrement : Fernet (AES-128-CBC + HMAC-SHA256)                           │
│                                                                             │
│  Dérivation de clé :                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  user.client_secret ──► SHA256 ──► Base64 ──► Fernet Key           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Flux de lecture :                                                          │
│  1. Générer la clé de cache                                                 │
│  2. Chercher dans Valkey                                                    │
│  3. Si trouvé : déchiffrer avec client_secret                               │
│  4. Si non trouvé : appeler Enedis, chiffrer, stocker                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Données publiques vs privées

```python
# Données utilisateur : TOUJOURS chiffrer
await cache_service.get(key, current_user.client_secret)
await cache_service.set(key, data, current_user.client_secret)

# Données publiques (Tempo, EcoWatt) : sans chiffrement
await cache_service.get_raw(key)
await cache_service.set_raw(key, value)
```

---

## Flux d'authentification

### OAuth2 Enedis

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUX OAUTH2 ENEDIS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. INSCRIPTION                                                             │
│  ━━━━━━━━━━━━━                                                              │
│  Utilisateur ──► Créer compte ──► Recevoir client_id/client_secret          │
│                                                                             │
│  2. CONSENTEMENT                                                            │
│  ━━━━━━━━━━━━━━                                                             │
│  Utilisateur         Backend              Enedis                            │
│       │                  │                   │                              │
│       │  Click consent   │                   │                              │
│       │─────────────────>│                   │                              │
│       │                  │  Redirect to      │                              │
│       │<─────────────────│  Enedis auth      │                              │
│       │                  │                   │                              │
│       │  Login Enedis    │                   │                              │
│       │─────────────────────────────────────>│                              │
│       │                  │                   │                              │
│       │  Authorize app   │                   │                              │
│       │─────────────────────────────────────>│                              │
│       │                  │                   │                              │
│       │  Redirect with   │                   │                              │
│       │<─────────────────────────────────────│                              │
│       │  code            │                   │                              │
│       │                  │                   │                              │
│       │  Callback        │                   │                              │
│       │─────────────────>│  Exchange code    │                              │
│       │                  │─────────────────>│                              │
│       │                  │<─────────────────│                              │
│       │                  │  access_token     │                              │
│       │                  │  refresh_token    │                              │
│       │                  │                   │                              │
│       │  200 OK          │  Store tokens     │                              │
│       │<─────────────────│  in PostgreSQL    │                              │
│                                                                             │
│  3. DÉTECTION PDL                                                           │
│  ━━━━━━━━━━━━━━━━                                                           │
│  Après consentement, le backend récupère automatiquement                    │
│  tous les PDL autorisés pour cet utilisateur                                │
│                                                                             │
│  4. REFRESH TOKEN                                                           │
│  ━━━━━━━━━━━━━━━━                                                           │
│  Tâche planifiée : refresh automatique avant expiration                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Scheduler (Tâches planifiées)

Le mode serveur utilise APScheduler pour les tâches de fond :

```python
# apps/api/src/main.py

def start_background_tasks():
    """Démarré uniquement en mode serveur"""

    # Refresh des tokens Enedis (avant expiration)
    scheduler.add_job(
        refresh_expiring_tokens,
        trigger=IntervalTrigger(hours=1),
    )

    # Mise à jour calendrier Tempo
    # - Toutes les 15 min (6h-23h)
    # - Uniquement si J+1 inconnu
    scheduler.add_job(
        rte_service.update_tempo_cache,
        trigger=CronTrigger(minute="*/15", hour="6-23"),
    )

    # Mise à jour EcoWatt
    # - 17h00 quotidien (publication RTE)
    # - 12h15 vendredi (anticipation week-end)
    # - Fallback horaire si J+3 incomplet
    scheduler.add_job(
        rte_service.update_ecowatt_cache,
        trigger=CronTrigger(hour=17, minute=0),
    )
    scheduler.add_job(
        rte_service.update_ecowatt_cache,
        trigger=CronTrigger(day_of_week="fri", hour=12, minute=15),
    )

    # Nettoyage cache expiré
    scheduler.add_job(
        cleanup_expired_cache,
        trigger=IntervalTrigger(hours=6),
    )

    # Mise à jour offres tarifaires (scrapers)
    scheduler.add_job(
        scraper_service.update_all_offers,
        trigger=CronTrigger(hour=2, minute=0),  # 2h du matin
    )
```

---

## Variables d'environnement

```bash
# Mode serveur activé
SERVER_MODE=true

# Base de données
DATABASE_URL=postgresql+asyncpg://user:pass@postgres:5432/myelectricaldata

# Cache Valkey
REDIS_URL=redis://valkey:6379/0

# Credentials Enedis (requis)
ENEDIS_CLIENT_ID=your-client-id
ENEDIS_CLIENT_SECRET=your-client-secret
ENEDIS_ENVIRONMENT=production  # ou sandbox

# Credentials RTE (optionnel)
RTE_CLIENT_ID=your-rte-client-id
RTE_CLIENT_SECRET=your-rte-client-secret

# JWT
SECRET_KEY=your-jwt-secret-key
ACCESS_TOKEN_EXPIRE_DAYS=30

# Admin
ADMIN_EMAILS=admin@example.com,admin2@example.com

# URLs
FRONTEND_URL=https://myelectricaldata.fr
BACKEND_URL=https://api.myelectricaldata.fr
```

---

## Différences clés avec le mode client

| Aspect | Mode Serveur | Mode Client |
|--------|--------------|-------------|
| **Source données** | Enedis API direct | API MyElectricalData |
| **Authentification** | JWT + OAuth2 Enedis | Token API pré-configuré |
| **Stockage** | Cache Valkey (24h) | PostgreSQL (indéfini) |
| **Users** | Multi-utilisateurs | Mono-utilisateur |
| **Administration** | Complète (UI admin) | Aucune |
| **Rate limiting** | 5 req/s + quotas | Géré par API distante |
| **Exports** | Non | Home Assistant, MQTT, etc. |
| **Page d'accueil** | Landing page | Redirection /dashboard |
| **Simulateur** | Oui | Non |
| **FAQ** | Oui | Non |
