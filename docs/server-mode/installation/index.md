---
sidebar_position: 1
---

# Vue d'ensemble

## Prérequis

### Matériel recommandé

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| CPU | 2 cores | 4 cores |
| RAM | 2 Go | 4 Go |
| Stockage | 10 Go | 50 Go |

### Logiciels requis

- Docker 24+
- Docker Compose 2.20+
- ou Kubernetes 1.25+ avec Helm 3.10+

### Credentials API

| API | Obligatoire | Description |
|-----|-------------|-------------|
| **Enedis DataHub** | ✅ Oui | Accès aux données de consommation/production |
| **RTE Tempo** | ❌ Non | Calendrier des jours Tempo |
| **RTE EcoWatt** | ❌ Non | Alertes tension réseau |

#### Obtenir les credentials Enedis

1. Créer un compte sur [datahub-enedis.fr](https://datahub-enedis.fr)
2. Créer une application (nécessite un SIRET)
3. Demander l'accès aux APIs :
   - Metering Data Daily Consumption
   - Metering Data Load Curve
   - Metering Data Daily Production
   - Customers Contact Data
   - Customers Contracts Data
4. Récupérer `client_id` et `client_secret`

#### Obtenir les credentials RTE (optionnel)

1. Créer un compte sur [data.rte-france.com](https://data.rte-france.com)
2. Souscrire aux APIs :
   - Tempo Like Supply Contract
   - Ecowatt
3. Récupérer `client_id` et `client_secret`

---

## Méthodes d'installation

| Méthode | Cas d'usage |
|---------|-------------|
| [Docker Compose](./docker.md) | Installation simple, serveur unique |
| [Helm (Kubernetes)](./helm.md) | Production, haute disponibilité |

---

## Configuration

### Variables d'environnement

Créer le fichier `apps/api/.env.docker` :

```bash
# Mode serveur
SERVER_MODE=true

# Base de données
DATABASE_URL=postgresql+asyncpg://myelectricaldata:password@postgres:5432/myelectricaldata

# Cache
REDIS_URL=redis://valkey:6379/0

# Enedis (REQUIS)
ENEDIS_CLIENT_ID=your-client-id
ENEDIS_CLIENT_SECRET=your-client-secret
ENEDIS_ENVIRONMENT=production

# RTE (OPTIONNEL)
RTE_CLIENT_ID=your-rte-client-id
RTE_CLIENT_SECRET=your-rte-client-secret

# JWT
SECRET_KEY=your-super-secret-key-minimum-32-chars

# Administration
ADMIN_EMAILS=admin@example.com

# URLs
FRONTEND_URL=http://localhost:8000
BACKEND_URL=http://localhost:8081
```

### Génération du SECRET_KEY

```bash
# Générer une clé sécurisée
openssl rand -hex 32
```

---

## Ports par défaut

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 8000 | Interface utilisateur |
| Backend | 8081 | API REST |
| PostgreSQL | 5432 | Base de données (interne) |
| Valkey | 6379 | Cache (interne) |
| pgAdmin | 5050 | Administration BDD (optionnel) |

---

## Première utilisation

### 1. Créer un compte administrateur

Le premier compte créé avec un email dans `ADMIN_EMAILS` devient automatiquement administrateur.

### 2. Configurer le consentement OAuth2

1. Se connecter avec le compte admin
2. Aller dans **Paramètres** > **Consentement Enedis**
3. Autoriser l'accès à vos données Linky
4. Les PDL sont automatiquement détectés

### 3. Vérifier le fonctionnement

1. Accéder au **Dashboard**
2. Vérifier que les PDL apparaissent
3. Consulter les données de consommation

---

## Sécurité

### Checklist production

- [ ] Changer le `SECRET_KEY` par défaut
- [ ] Utiliser HTTPS (reverse proxy Caddy/Nginx)
- [ ] Configurer un pare-feu
- [ ] Limiter l'accès à pgAdmin
- [ ] Sauvegarder régulièrement la base de données
- [ ] Mettre à jour régulièrement les images Docker

### Reverse proxy recommandé

```bash
# Exemple avec Caddy
myelectricaldata.example.com {
    reverse_proxy frontend:80

    handle /api/* {
        reverse_proxy backend:8000
    }
}
```
