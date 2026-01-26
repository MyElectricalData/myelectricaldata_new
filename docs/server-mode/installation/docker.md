---
sidebar_position: 2
---

# Installation Docker

Déploiement via Docker Compose.

## Prérequis

- Docker 24+
- Docker Compose 2.20+
- Credentials Enedis DataHub

```bash
# Vérifier les versions
docker --version
docker compose version
```

---

## Installation

### Étape 1 : Cloner le dépôt

```bash
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata
```

### Étape 2 : Configurer l'environnement

```bash
# Copier le fichier exemple
cp apps/api/.env.example apps/api/.env.docker

# Éditer la configuration
vim apps/api/.env.docker
```

Configuration minimale requise :

```bash
# Mode serveur
SERVER_MODE=true

# Base de données
DATABASE_URL=postgresql+asyncpg://myelectricaldata:your-password@postgres:5432/myelectricaldata

# Cache
REDIS_URL=redis://valkey:6379/0

# Enedis (REQUIS)
ENEDIS_CLIENT_ID=your-enedis-client-id
ENEDIS_CLIENT_SECRET=your-enedis-client-secret
ENEDIS_ENVIRONMENT=production

# JWT (générer avec: openssl rand -hex 32)
SECRET_KEY=your-super-secret-key-minimum-32-characters

# Administration
ADMIN_EMAILS=admin@example.com
```

### Étape 3 : Démarrer les services

```bash
# Démarrer en arrière-plan
docker compose up -d

# Vérifier le statut
docker compose ps
```

### Étape 4 : Appliquer les migrations

```bash
docker compose exec backend alembic upgrade head
```

### Étape 5 : Accéder à l'application

- **Frontend** : http://localhost:8000
- **API Docs** : http://localhost:8081/docs
- **pgAdmin** : http://localhost:5050 (optionnel)

---

## Services déployés

```
┌────────────────────────────────────────────────────────┐
│                  Docker Compose                         │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐        │
│  │ Frontend │────▶│ Backend  │────▶│PostgreSQL│        │
│  │  :8000   │     │  :8081   │     │  :5432   │        │
│  └──────────┘     └────┬─────┘     └──────────┘        │
│                        │                               │
│                        ▼                               │
│                   ┌──────────┐     ┌──────────┐        │
│                   │  Valkey  │     │ pgAdmin  │        │
│                   │  :6379   │     │  :5050   │        │
│                   └──────────┘     └──────────┘        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## Commandes utiles

### Gestion des services

```bash
# Démarrer
docker compose up -d

# Arrêter
docker compose down

# Redémarrer
docker compose restart

# Voir les logs
docker compose logs -f

# Logs d'un service spécifique
docker compose logs -f backend
docker compose logs -f frontend
```

### Base de données

```bash
# Accès shell PostgreSQL
docker compose exec postgres psql -U myelectricaldata

# Appliquer les migrations
docker compose exec backend alembic upgrade head

# Rollback dernière migration
docker compose exec backend alembic downgrade -1

# Créer une nouvelle migration
docker compose exec backend alembic revision --autogenerate -m "Description"

# Backup
docker compose exec postgres pg_dump -U myelectricaldata > backup.sql

# Restore
docker compose exec -T postgres psql -U myelectricaldata < backup.sql
```

### Maintenance

```bash
# Reconstruire les images
docker compose build --no-cache

# Mettre à jour
git pull
docker compose pull
docker compose up -d

# Nettoyer les ressources inutilisées
docker system prune -f
```

---

## Configuration avancée

### Variables d'environnement complètes

```bash
# Mode
SERVER_MODE=true

# Base de données
DATABASE_URL=postgresql+asyncpg://myelectricaldata:password@postgres:5432/myelectricaldata

# Cache
REDIS_URL=redis://valkey:6379/0

# Enedis
ENEDIS_CLIENT_ID=xxx
ENEDIS_CLIENT_SECRET=xxx
ENEDIS_ENVIRONMENT=production
ENEDIS_REDIRECT_URI=http://localhost:8081/oauth/callback

# RTE (optionnel)
RTE_CLIENT_ID=xxx
RTE_CLIENT_SECRET=xxx

# JWT
SECRET_KEY=xxx
ACCESS_TOKEN_EXPIRE_DAYS=30

# Administration
ADMIN_EMAILS=admin@example.com,admin2@example.com

# URLs
FRONTEND_URL=http://localhost:8000
BACKEND_URL=http://localhost:8081

# Logging
LOG_LEVEL=INFO

# Rate limiting
RATE_LIMIT_PER_SECOND=5
DAILY_QUOTA=10000
```

### Personnaliser les ports

Modifier `docker-compose.yml` :

```yaml
services:
  frontend:
    ports:
      - "3000:80"  # Au lieu de 8000

  backend:
    ports:
      - "8080:8000"  # Au lieu de 8081
```

### Ajouter un reverse proxy (Caddy)

```yaml
# docker-compose.override.yml
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on:
      - frontend
      - backend

volumes:
  caddy_data:
```

```
# Caddyfile
myelectricaldata.example.com {
    reverse_proxy frontend:80

    handle /api/* {
        reverse_proxy backend:8000
    }

    handle /docs* {
        reverse_proxy backend:8000
    }
}
```

---

## Dépannage

### Le backend ne démarre pas

```bash
# Vérifier les logs
docker compose logs backend

# Problèmes courants :
# - DATABASE_URL incorrect
# - REDIS_URL incorrect
# - SECRET_KEY manquant
# - ENEDIS_CLIENT_ID/SECRET manquants
```

### Erreur de connexion à PostgreSQL

```bash
# Vérifier que PostgreSQL est démarré
docker compose ps postgres

# Tester la connexion
docker compose exec postgres pg_isready

# Vérifier les logs PostgreSQL
docker compose logs postgres
```

### Erreur de connexion à Valkey

```bash
# Vérifier que Valkey est démarré
docker compose ps valkey

# Tester la connexion
docker compose exec valkey redis-cli ping
```

### Migrations échouent

```bash
# Vérifier l'état actuel
docker compose exec backend alembic current

# Voir l'historique
docker compose exec backend alembic history

# Forcer le stamp (si base existante)
docker compose exec backend alembic stamp head
```

---

## Mise à jour

```bash
# Arrêter les services
docker compose down

# Récupérer les mises à jour
git pull

# Reconstruire et démarrer
docker compose up -d --build

# Appliquer les migrations
docker compose exec backend alembic upgrade head
```

---

## Désinstallation

```bash
# Arrêter et supprimer les conteneurs
docker compose down

# Supprimer aussi les volumes (ATTENTION: perte de données)
docker compose down -v

# Supprimer les images
docker compose down --rmi all
```
