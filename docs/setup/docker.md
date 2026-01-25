---
sidebar_position: 1
title: Installation Docker
description: Installation Docker Compose pour les modes Client et Serveur
---

# Installation Docker Compose

Ce guide couvre l'installation de MyElectricalData via Docker Compose pour les deux modes d'exécution.

## Prérequis

- Docker Engine 20.10+ et Docker Compose v2
- 2 Go de RAM minimum
- 10 Go d'espace disque

```bash
# Vérifier les versions
docker --version
docker compose version
```

## Mode Client (défaut)

Le mode Client est recommandé pour une installation personnelle avec intégration domotique.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Network                       │
├─────────────┬─────────────┬───────────────┬─────────────┤
│  Frontend   │   Backend   │  PostgreSQL   │ VictoriaM.  │
│   :8100     │    :8181    │    :5432      │   :8428     │
└─────────────┴─────────────┴───────────────┴─────────────┘
        │             │
        └──────┬──────┘
               │
    ┌──────────▼──────────┐
    │  API MyElectricalData │
    │  (v2.myelectricaldata.fr) │
    └─────────────────────┘
```

### Installation rapide

```bash
# Cloner le repository
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata

# Copier et configurer les variables d'environnement
cp .env.client.example .env.client
nano .env.client  # Configurer vos identifiants

# Démarrer les services
docker compose -f docker-compose.client.yml up -d

# Vérifier les logs
docker compose -f docker-compose.client.yml logs -f
```

### Configuration

#### Fichier `.env.client`

```bash
# === Identifiants MyElectricalData API ===
# Obtenez-les sur https://v2.myelectricaldata.fr
MED_CLIENT_ID=votre-client-id
MED_CLIENT_SECRET=votre-client-secret

# === Base de données PostgreSQL ===
POSTGRES_PASSWORD=motdepasse-securise
DATABASE_URL=postgresql+asyncpg://myelectricaldata:${POSTGRES_PASSWORD}@postgres:5432/myelectricaldata_client

# === Optionnel : Exports domotique ===
# Home Assistant
HA_ENABLED=false
HA_URL=http://homeassistant.local:8123
HA_TOKEN=votre-token-ha

# MQTT
MQTT_ENABLED=false
MQTT_HOST=mqtt.local
MQTT_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_TOPIC=myelectricaldata

# Jeedom
JEEDOM_ENABLED=false
JEEDOM_URL=http://jeedom.local
JEEDOM_API_KEY=
```

### Accès

| Service | URL |
|---------|-----|
| Frontend | <http://localhost:8100> |
| Backend API | <http://localhost:8181> |
| Documentation API | <http://localhost:8181/docs> |

### Commandes utiles

```bash
# Démarrer
docker compose -f docker-compose.client.yml up -d

# Arrêter
docker compose -f docker-compose.client.yml down

# Logs
docker compose -f docker-compose.client.yml logs -f
docker compose -f docker-compose.client.yml logs -f backend

# Redémarrer un service
docker compose -f docker-compose.client.yml restart backend

# Mise à jour
docker compose -f docker-compose.client.yml pull
docker compose -f docker-compose.client.yml up -d
```

---

## Mode Serveur

Le mode Serveur est destiné à héberger un service multi-utilisateurs avec accès direct aux API Enedis.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Caddy (Reverse Proxy)                    │
│              https://myelectricaldata.fr                 │
│                   Ports: 80, 443                         │
└──────────────────────┬──────────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
┌──────▼─────┐  ┌─────▼──────┐  ┌─────▼──────┐
│  Frontend  │  │  Backend   │  │   Valkey   │
│  (Nginx)   │  │  (FastAPI) │  │  (Cache)   │
│  Port: 80  │  │  Port: 8000│  │  Port: 6379│
└────────────┘  └─────┬──────┘  └────────────┘
                      │
              ┌───────▼───────┐
              │  PostgreSQL   │
              │   Port: 5432  │
              └───────────────┘
```

### Installation rapide

```bash
# Cloner le repository
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata

# Copier et configurer les variables d'environnement
cp apps/api/.env.example apps/api/.env.docker
nano apps/api/.env.docker  # Configurer vos identifiants

# Démarrer les services
docker compose up -d

# Vérifier les logs
docker compose logs -f
```

### Configuration

#### Fichier `apps/api/.env.docker`

##### Base de données

```bash
# SQLite (simple, fichier local)
DATABASE_URL=sqlite+aiosqlite:///./data/myelectricaldata.db

# PostgreSQL (recommandé en production)
DATABASE_URL=postgresql+asyncpg://myelectricaldata:motdepasse@postgres:5432/myelectricaldata
```

##### Application

| Variable | Description | Défaut |
|----------|-------------|--------|
| `DEBUG` | Mode debug (logs détaillés) | `false` |
| `SECRET_KEY` | **Critique** — Clé JWT | Requis |
| `SERVER_MODE` | Active le mode serveur | `true` |

```bash
DEBUG=false
SECRET_KEY=générer-avec-python-secrets
SERVER_MODE=true
```

> **Générer une SECRET_KEY sécurisée :**
>
> ```bash
> python -c "import secrets; print(secrets.token_urlsafe(32))"
> ```

##### API Enedis (Data Connect)

Obtenez vos identifiants sur le [portail développeur Enedis](https://datahub-enedis.fr/).

```bash
ENEDIS_CLIENT_ID=votre-client-id
ENEDIS_CLIENT_SECRET=votre-client-secret
ENEDIS_REDIRECT_URI=https://myelectricaldata.fr/oauth/callback
ENEDIS_ENVIRONMENT=production  # ou sandbox pour les tests
```

##### API RTE (Tempo & Ecowatt)

Obtenez vos identifiants sur le [portail API RTE](https://data.rte-france.com/).

```bash
RTE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
RTE_CLIENT_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

##### URLs

```bash
FRONTEND_URL=https://myelectricaldata.fr
BACKEND_URL=https://myelectricaldata.fr/api
```

##### Cache Valkey

```bash
REDIS_URL=redis://valkey:6379/0
CACHE_TTL_SECONDS=86400  # 24 heures
```

##### Administration

```bash
ADMIN_EMAILS=admin@example.com,autre.admin@example.com
```

#### Fichier `apps/web/.env.docker`

```bash
VITE_API_BASE_URL=/api
VITE_APP_NAME=MyElectricalData
VITE_SERVER_MODE=true
```

### Configuration DNS (production)

Pour un déploiement en production, configurez votre DNS :

```
A    myelectricaldata.fr    123.45.67.89
```

En développement local, ajoutez à `/etc/hosts` :

```bash
echo "127.0.0.1 myelectricaldata.fr" | sudo tee -a /etc/hosts
```

### Accès

| Service | URL |
|---------|-----|
| Frontend | <https://myelectricaldata.fr> |
| Backend API | <https://myelectricaldata.fr/api> |
| Documentation API | <https://myelectricaldata.fr/docs> |

### Commandes utiles

```bash
# Démarrer
docker compose up -d

# Arrêter
docker compose down

# Logs
docker compose logs -f
docker compose logs -f backend

# Redémarrer un service
docker compose restart backend

# Rebuilder après modification
docker compose build --no-cache backend
docker compose up -d

# Mise à jour
git pull
docker compose build
docker compose up -d
```

---

## Gestion de la base de données

### Migrations Alembic

```bash
# Mode Client
docker compose -f docker-compose.client.yml exec backend alembic upgrade head

# Mode Serveur
docker compose exec backend alembic upgrade head

# Voir l'historique des migrations
docker compose exec backend alembic history

# Rollback
docker compose exec backend alembic downgrade -1
```

### Backup

```bash
# Mode Client (PostgreSQL)
docker compose -f docker-compose.client.yml exec postgres pg_dump -U myelectricaldata myelectricaldata_client > backup.sql

# Mode Serveur (PostgreSQL)
docker compose exec postgres pg_dump -U myelectricaldata myelectricaldata > backup.sql

# Mode Serveur (SQLite)
docker compose exec backend cp /app/data/myelectricaldata.db /app/data/backup-$(date +%Y%m%d).db
```

---

## Dépannage

### Le backend ne démarre pas

```bash
# Vérifier les logs
docker compose logs backend

# Vérifier la configuration
docker compose config

# Vérifier les variables d'environnement
docker compose exec backend env | grep -E "(DATABASE|SECRET|ENEDIS)"
```

### Erreur de connexion à la base de données

```bash
# Vérifier que PostgreSQL est prêt
docker compose exec postgres pg_isready

# Tester la connexion
docker compose exec backend python -c "from src.config.database import engine; print('OK')"
```

### Le frontend affiche une erreur 404

```bash
# Rebuilder le frontend
docker compose build --no-cache frontend
docker compose up -d frontend
```

### Erreur de certificat SSL (mode Serveur)

```bash
# Supprimer les certificats Caddy et redémarrer
docker compose down
docker volume rm myelectricaldata_caddy_data
docker compose up -d
```

---

## Monitoring

### Health checks

```bash
# Statut des services
docker compose ps

# Mode Client
curl http://localhost:8181/ping

# Mode Serveur
curl https://myelectricaldata.fr/api/ping
```

### Métriques

```bash
# Utilisation CPU/Mémoire
docker stats

# Espace disque
docker system df -v
```

---

## Prochaines étapes

- [Configuration de la base de données](/setup/database)
- [Installation Helm (Kubernetes)](/setup/helm)
- [Mode développement](/setup/dev-mode)
