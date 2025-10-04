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

Le projet utilise des fichiers `.env.docker` séparés pour chaque service :

#### Backend : `apps/api/.env.docker`

```bash
# Database
DATABASE_URL=sqlite+aiosqlite:///./data/myelectricaldata.db

# Application
DEBUG=false
DEBUG_SQL=false
SECRET_KEY=ton-secret-key-super-securise

# Enedis OAuth
ENEDIS_CLIENT_ID=ton-client-id
ENEDIS_CLIENT_SECRET=ton-client-secret
ENEDIS_REDIRECT_URI=https://myelectricaldata.fr/consent
ENEDIS_ENVIRONMENT=production

# URLs
FRONTEND_URL=https://myelectricaldata.fr
BACKEND_URL=https://myelectricaldata.fr/api

# Mailgun (optionnel)
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
REQUIRE_EMAIL_VERIFICATION=false

# Cloudflare Turnstile (optionnel)
TURNSTILE_SECRET_KEY=
REQUIRE_CAPTCHA=false
```

#### Frontend : `apps/web/.env.docker`

```bash
# API Base URL (utilisé au build time)
VITE_API_BASE_URL=/api

# Application
VITE_APP_NAME=MyElectricalData

# Cloudflare Turnstile
VITE_TURNSTILE_SITE_KEY=votre-site-key

# Debug
VITE_DEBUG=false
```

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

- **Frontend** : https://myelectricaldata.fr
- **API** : https://myelectricaldata.fr/api
- **Documentation API** : https://myelectricaldata.fr/docs

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
      - VITE_API_BASE_URL=/api  # Modifier ici
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
- Documentation Caddy : https://caddyserver.com/docs
- Documentation Docker Compose : https://docs.docker.com/compose/
