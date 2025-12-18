---
sidebar_position: 1
title: Installation Docker
description: Configuration Docker complète avec reverse proxy Caddy
---

# 🐳 Docker Setup - MyElectricalData

Configuration Docker complète avec reverse proxy Caddy pour MyElectricalData.

## 📋 Architecture

```
┌─────────────────────────────────────────┐
│          Caddy (Reverse Proxy)          │
│       https://myelectricaldata.fr       │
│              Ports: 80, 443             │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴───────┐
       │               │
┌──────▼─────┐  ┌─────▼──────┐
│  Frontend  │  │  Backend   │
│  (Nginx)   │  │  (FastAPI) │
│  Port: 80  │  │  Port: 8000│
└────────────┘  └────────────┘
```

## 🚀 Démarrage rapide

### 1. Configuration

Le projet utilise des fichiers `.env.docker` séparés pour chaque service.

#### Backend : `apps/api/.env.docker`

##### 🗄️ Base de données

| Variable | Description | Valeurs possibles |
|----------|-------------|-------------------|
| `DATABASE_URL` | URI de connexion à la base de données. Le type (SQLite/PostgreSQL) est auto-détecté. | `sqlite+aiosqlite:///./data/myelectricaldata.db` (défaut) ou `postgresql+asyncpg://user:pass@host:5432/db` |

```bash
# SQLite (simple, fichier local)
DATABASE_URL=sqlite+aiosqlite:///./data/myelectricaldata.db

# PostgreSQL (recommandé en production)
DATABASE_URL=postgresql+asyncpg://myelectricaldata:motdepasse@postgres:5432/myelectricaldata
```

##### ⚙️ Application

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `DEBUG` | Active le mode debug (logs détaillés, reload auto). **Désactiver en production.** | `false` |
| `DEBUG_SQL` | Affiche toutes les requêtes SQL dans les logs. Utile pour le debugging. | `false` |
| `SECRET_KEY` | **🔐 Critique** — Clé de signature des tokens JWT. Voir [section dédiée](#-configuration-secret_key). | ❌ Requis |

```bash
DEBUG=false
DEBUG_SQL=false
SECRET_KEY=générer-avec-python-secrets  # Voir section SECRET_KEY
```

##### 🔌 API Enedis (Data Connect)

Ces identifiants sont obtenus sur le [portail développeur Enedis](https://datahub-enedis.fr/).

| Variable | Description | Exemple |
|----------|-------------|---------|
| `ENEDIS_CLIENT_ID` | Identifiant de votre application Enedis | `abc123def456` |
| `ENEDIS_CLIENT_SECRET` | Secret de votre application Enedis | `secret789xyz` |
| `ENEDIS_REDIRECT_URI` | URL de callback OAuth2 (doit correspondre à celle déclarée sur Enedis) | `https://myelectricaldata.fr/oauth/callback` |
| `ENEDIS_ENVIRONMENT` | Environnement API : `sandbox` (données fictives) ou `production` (données réelles) | `production` |

```bash
ENEDIS_CLIENT_ID=votre-client-id
ENEDIS_CLIENT_SECRET=votre-client-secret
ENEDIS_REDIRECT_URI=https://myelectricaldata.fr/oauth/callback
ENEDIS_ENVIRONMENT=production
```

> 💡 **Sandbox vs Production** : Utilisez `sandbox` pour tester sans données réelles. Les PDL de test sont fournis par Enedis dans leur documentation.

##### ⚡ API RTE (Tempo & Ecowatt)

Ces identifiants sont obtenus sur le [portail API RTE](https://data.rte-france.com/).

| Variable | Description | Format |
|----------|-------------|--------|
| `RTE_CLIENT_ID` | Identifiant de votre application RTE | UUID `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `RTE_CLIENT_SECRET` | Secret de votre application RTE | UUID long |

```bash
RTE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
RTE_CLIENT_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> 💡 **À quoi ça sert ?** Les API RTE fournissent le calendrier Tempo (jours bleu/blanc/rouge) et les alertes Ecowatt (tension sur le réseau électrique).

##### 🌐 URLs

| Variable | Description | Exemple |
|----------|-------------|---------|
| `FRONTEND_URL` | URL publique du frontend (utilisée pour les liens dans les emails, CORS, etc.) | `https://myelectricaldata.fr` |
| `BACKEND_URL` | URL publique de l'API (utilisée pour générer les liens dans les réponses) | `https://myelectricaldata.fr/api` |

```bash
FRONTEND_URL=https://myelectricaldata.fr
BACKEND_URL=https://myelectricaldata.fr/api
```

##### 📧 Emails (Mailgun) — Optionnel

Permet l'envoi d'emails (vérification de compte, notifications).

| Variable | Description | Exemple |
|----------|-------------|---------|
| `MAILGUN_API_KEY` | Clé API Mailgun | `key-xxxxxxxxxxxxxx` |
| `MAILGUN_DOMAIN` | Domaine vérifié sur Mailgun | `mg.myelectricaldata.fr` |
| `MAILGUN_FROM_EMAIL` | Adresse d'expédition | `MyElectricalData <noreply@myelectricaldata.fr>` |
| `MAILGUN_API_BASE_URL` | URL de l'API Mailgun (US ou EU) | `https://api.eu.mailgun.net/v3` |
| `REQUIRE_EMAIL_VERIFICATION` | Exige la vérification email avant activation du compte | `false` |

```bash
MAILGUN_API_KEY=key-xxxxxxxxxxxxxx
MAILGUN_DOMAIN=mg.myelectricaldata.fr
MAILGUN_FROM_EMAIL=MyElectricalData <noreply@myelectricaldata.fr>
MAILGUN_API_BASE_URL=https://api.eu.mailgun.net/v3  # Pour l'Europe
REQUIRE_EMAIL_VERIFICATION=false
```

> 💡 **Sans Mailgun** : Laissez les champs vides et `REQUIRE_EMAIL_VERIFICATION=false`. Les comptes seront activés immédiatement.

##### 🛡️ Protection anti-bot (Turnstile) — Optionnel

Cloudflare Turnstile protège les formulaires d'inscription contre les bots.

| Variable | Description | Où l'obtenir |
|----------|-------------|--------------|
| `TURNSTILE_SECRET_KEY` | Clé secrète (côté serveur) | [Dashboard Cloudflare](https://dash.cloudflare.com/?to=/:account/turnstile) |
| `REQUIRE_CAPTCHA` | Active la vérification Turnstile sur l'inscription | `false` |

```bash
TURNSTILE_SECRET_KEY=0x4AAAAAAA...
REQUIRE_CAPTCHA=false
```

##### 👑 Administration

| Variable | Description | Format |
|----------|-------------|--------|
| `ADMIN_EMAILS` | Liste des emails ayant accès à l'interface admin | Emails séparés par des virgules |

```bash
ADMIN_EMAILS=admin@example.com,autre.admin@example.com
```

##### 🚦 Rate Limiting

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `ENEDIS_RATE_LIMIT` | Limite de requêtes/seconde vers Enedis (protection contre le blocage) | `5` |
| `USER_DAILY_LIMIT_NO_CACHE` | Quota journalier par utilisateur (requêtes vers Enedis) | `50` |
| `USER_DAILY_LIMIT_WITH_CACHE` | Quota journalier par utilisateur (requêtes servies depuis le cache) | `1000` |

```bash
ENEDIS_RATE_LIMIT=5
USER_DAILY_LIMIT_NO_CACHE=50
USER_DAILY_LIMIT_WITH_CACHE=1000
```

##### 🗃️ Cache Valkey (Redis-compatible)

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `REDIS_URL` | URI de connexion Valkey (protocole Redis) | `redis://valkey:6379/0` |
| `CACHE_TTL_SECONDS` | Durée de vie du cache en secondes (86400 = 24h) | `86400` |

```bash
REDIS_URL=redis://valkey:6379/0
CACHE_TTL_SECONDS=86400
```

---

#### Frontend : `apps/web/.env.docker`

| Variable | Description | Valeur typique |
|----------|-------------|----------------|
| `VITE_API_BASE_URL` | Chemin de base de l'API (relatif ou absolu) | `/api` |
| `VITE_APP_NAME` | Nom affiché dans l'application | `MyElectricalData` |
| `VITE_TURNSTILE_SITE_KEY` | Clé publique Turnstile (côté client) | `0x4AAAAAAA...` |
| `VITE_DEBUG` | Active les logs de debug dans la console navigateur | `false` |

```bash
VITE_API_BASE_URL=/api
VITE_APP_NAME=MyElectricalData
VITE_TURNSTILE_SITE_KEY=0x4AAAAAAA...
VITE_DEBUG=false
```

> ⚠️ **Variables VITE_*** : Ces variables sont injectées **au moment du build**, pas au runtime. Toute modification nécessite un rebuild du frontend.

---

**Important** : Les fichiers `.env.docker` sont déjà créés. Modifie-les avec tes propres valeurs avant de démarrer.

### 2. Construire et démarrer

```bash
# Construction des images
docker compose build

# Démarrer tous les services
docker compose up -d

# Voir les logs
docker compose logs -f

# Voir les logs d'un service spécifique
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f caddy
```

### 3. Accéder à l'application

- **Frontend** : <https://myelectricaldata.fr>
- **API** : <https://myelectricaldata.fr/api>
- **Documentation API** : <https://myelectricaldata.fr/docs>

⚠️ **Important** : Assure-toi que `myelectricaldata.fr` pointe vers `127.0.0.1` dans ton `/etc/hosts` :

```bash
echo "127.0.0.1 myelectricaldata.fr" | sudo tee -a /etc/hosts
```

## 🛠️ Commandes utiles

### Gestion des services

```bash
# Arrêter tous les services
docker compose down

# Arrêter et supprimer les volumes
docker compose down -v

# Redémarrer un service spécifique
docker compose restart backend

# Rebuilder un service spécifique
docker compose build --no-cache backend
docker compose up -d backend
```

### Logs et debugging

```bash
# Logs en temps réel
docker compose logs -f

# Logs des 100 dernières lignes
docker compose logs --tail=100

# Accéder au shell d'un conteneur
docker compose exec backend sh
docker compose exec frontend sh
```

### Base de données

```bash
# Accéder à la base de données SQLite
docker compose exec backend sh
sqlite3 /app/data/myelectricaldata.db

# Backup de la base de données
docker compose exec backend sh -c "cp /app/data/myelectricaldata.db /app/data/backup-$(date +%Y%m%d-%H%M%S).db"
```

## 🔐 Configuration SECRET_KEY

La `SECRET_KEY` est une variable **critique pour la sécurité** de l'application. Elle sert à **signer et vérifier les tokens JWT** (JSON Web Tokens) qui authentifient les utilisateurs.

### Rôle de la SECRET_KEY

| Opération | Description |
|-----------|-------------|
| **Signature des tokens** | Lors de la connexion, le serveur crée un JWT signé avec cette clé. Sans elle, impossible de générer des tokens valides. |
| **Vérification des tokens** | À chaque requête authentifiée, le serveur vérifie que le token n'a pas été modifié en validant sa signature. |

### Fonctionnement technique

```
┌─────────────┐     SECRET_KEY      ┌─────────────┐
│   Payload   │ ──────────────────► │  Token JWT  │
│  (user_id)  │   HMAC-SHA256       │   signé     │
└─────────────┘                     └─────────────┘
```

L'algorithme utilisé est **HS256** (HMAC-SHA256), une signature symétrique où la même clé sert à signer et vérifier.

### Génération d'une clé sécurisée

```bash
# Méthode recommandée (32 caractères aléatoires)
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Exemple de résultat
# kX9vZmYhR3pLwN8qT5uJ2fA7dC1bE6gH
```

### ⚠️ Points de sécurité importants

| Risque | Conséquence |
|--------|-------------|
| **Clé compromise** | Un attaquant peut générer des tokens valides pour n'importe quel utilisateur |
| **Clé modifiée** | Tous les utilisateurs sont déconnectés (leurs tokens deviennent invalides) |
| **Clé partagée entre environnements** | Une compromission en dev expose la production |

### Bonnes pratiques

- ✅ Utiliser une clé d'au moins 32 caractères aléatoires
- ✅ Générer une clé **unique par environnement** (dev, staging, prod)
- ✅ Stocker la clé dans un gestionnaire de secrets (Vault, Kubernetes Secrets, etc.)
- ❌ Ne jamais commiter la clé dans le code source
- ❌ Ne jamais utiliser une valeur par défaut en production

## 🔧 Configuration avancée

### Variables d'environnement

#### Backend (`apps/api/.env`)

Toutes les variables d'environnement du backend sont chargées depuis `apps/api/.env`.

#### Frontend

Le frontend utilise `VITE_API_BASE_URL=/api` qui est défini au moment du build. Pour le modifier :

```yaml
# Dans docker-compose.yml
frontend:
  build:
    args:
      - VITE_API_BASE_URL=/api # Modifier ici
```

### Caddy

La configuration Caddy se trouve dans `Caddyfile`. Pour modifier les routes :

```caddyfile
myelectricaldata.fr {
    # Ajouter une nouvelle route
    handle /nouvelle-route* {
        reverse_proxy backend:8000
    }
}
```

Après modification, redémarre Caddy :

```bash
docker compose restart caddy
```

### Volumes

- `caddy_data` : Certificats SSL et données Caddy
- `caddy_config` : Configuration Caddy
- `./apps/api/data` : Base de données SQLite

## 🔒 HTTPS / SSL

### Développement local

Caddy génère automatiquement des certificats auto-signés pour `myelectricaldata.fr`.

Ton navigateur affichera un avertissement de sécurité. C'est normal en développement local. Tu peux :

- Cliquer sur "Avancé" → "Continuer vers le site"
- Ou importer le certificat Caddy dans ton système

### Production

En production, Caddy génère automatiquement des certificats Let's Encrypt valides si :

1. `myelectricaldata.fr` pointe vers ton serveur (DNS configuré)
2. Les ports 80 et 443 sont accessibles depuis Internet
3. Le domaine est un vrai domaine (pas juste dans `/etc/hosts`)

## 📊 Monitoring

### Health checks

```bash
# Vérifier le statut des services
docker compose ps

# Tester le backend
curl https://myelectricaldata.fr/api/ping

# Tester le frontend
curl https://myelectricaldata.fr
```

### Métriques

```bash
# Utilisation CPU/Mémoire
docker stats

# Espace disque des volumes
docker system df -v
```

## 🐛 Dépannage

### Le service ne démarre pas

```bash
# Voir les logs détaillés
docker compose logs backend

# Vérifier la configuration
docker compose config
```

### Erreur de certificat SSL

```bash
# Supprimer les certificats et redémarrer
docker compose down
docker volume rm myelectricaldata_caddy_data
docker compose up -d
```

### Backend ne se connecte pas

```bash
# Vérifier que le backend est accessible depuis Caddy
docker compose exec caddy wget -O- http://backend:8000/ping
```

### Frontend affiche une erreur 404

```bash
# Rebuilder le frontend
docker compose build --no-cache frontend
docker compose up -d frontend
```

## 🚀 Déploiement en production

### 1. Préparation

```bash
# Cloner le repo sur le serveur
git clone https://github.com/ton-repo/myelectricaldata.git
cd myelectricaldata

# Configurer les variables d'environnement
cp apps/api/.env.example apps/api/.env
nano apps/api/.env
```

### 2. Configuration DNS

Assure-toi que `myelectricaldata.fr` pointe vers l'IP de ton serveur :

```
A    myelectricaldata.fr    123.45.67.89
```

### 3. Déploiement

```bash
# Build et démarrage
docker compose build
docker compose up -d

# Vérifier les logs
docker compose logs -f
```

### 4. Maintenance

```bash
# Mise à jour
git pull
docker compose build
docker compose up -d

# Backup automatique (cron)
0 2 * * * cd /path/to/myelectricaldata && docker compose exec -T backend sh -c "cp /app/data/myelectricaldata.db /app/data/backup-$(date +\%Y\%m\%d).db"
```

## 📝 Notes

- **Performance** : En production, Caddy gère automatiquement HTTP/2, HTTP/3, et la compression
- **Sécurité** : Les certificats SSL sont renouvelés automatiquement
- **Logs** : Tous les logs sont disponibles via `docker compose logs`
- **Restart** : Les services redémarrent automatiquement (`restart: unless-stopped`)

## 🆘 Support

Pour plus d'aide :

- Documentation Caddy : <https://caddyserver.com/docs>
- Documentation Docker Compose : <https://docs.docker.com/compose/>
