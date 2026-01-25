# Installation Docker

Installation du mode client via Docker Compose.

## Prérequis

- Docker 24+ et Docker Compose v2
- Accès réseau vers `www.v2.myelectricaldata.fr`

```bash
# Vérifier les versions
docker --version
docker compose version
```

## Installation

### Étape 1 : Cloner le dépôt

```bash
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata
```

### Étape 2 : Configurer

```bash
# Copier le template
cp .env.client.example .env.client

# Éditer avec vos credentials
nano .env.client
```

**Contenu minimum de `.env.client`** :

```bash
# === OBLIGATOIRE ===
# Credentials API MyElectricalData (depuis votre compte)
MED_CLIENT_ID=cli_xxxxxxxxxxxxxxxxxxxxxxxxx
MED_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# === OPTIONNEL ===
TZ=Europe/Paris
CLIENT_FRONTEND_PORT=8100
CLIENT_BACKEND_PORT=8181
```

### Étape 3 : Démarrer

```bash
docker compose -f docker-compose.client.yml up -d
```

### Étape 4 : Vérifier

```bash
# Logs
docker compose -f docker-compose.client.yml logs -f

# Accéder à l'interface
open http://localhost:8100
```

---

## Première synchronisation

Au premier démarrage, les données ne sont pas encore synchronisées.

### Synchronisation automatique

Le scheduler lance une synchronisation quotidienne à 6h00.

### Synchronisation manuelle

1. Accéder à http://localhost:8100
2. Aller dans **Dashboard**
3. Cliquer sur **Synchroniser**

---

## Installation sur Raspberry Pi

Le mode client est optimisé pour Raspberry Pi 3B+ ou supérieur.

### Configuration spécifique

Ajouter dans `.env.client` :

```bash
# Réduire l'utilisation mémoire
POSTGRES_SHARED_BUFFERS=64MB
POSTGRES_WORK_MEM=4MB
```

### Architectures supportées

- ARM64 (Pi 4, Pi 5)
- ARMv7 (Pi 3)

```bash
# Vérifier l'architecture
uname -m
```

---

## Commandes utiles

```bash
# Démarrer
docker compose -f docker-compose.client.yml up -d

# Arrêter
docker compose -f docker-compose.client.yml down

# Logs
docker compose -f docker-compose.client.yml logs -f
docker compose -f docker-compose.client.yml logs -f backend

# Redémarrer
docker compose -f docker-compose.client.yml restart backend
```

---

## Mise à jour

```bash
# Arrêter
docker compose -f docker-compose.client.yml down

# Mettre à jour
git pull

# Redémarrer
docker compose -f docker-compose.client.yml up -d --build
```

---

## Sauvegarde

### PostgreSQL

```bash
docker compose -f docker-compose.client.yml exec postgres \
  pg_dump -U myelectricaldata myelectricaldata_client > backup.sql
```

### Restauration

```bash
docker compose -f docker-compose.client.yml exec -T postgres \
  psql -U myelectricaldata myelectricaldata_client < backup.sql
```

---

## Dépannage

### Le frontend ne démarre pas

```bash
# Vérifier les logs
docker compose -f docker-compose.client.yml logs frontend

# Port déjà utilisé ? Modifier CLIENT_FRONTEND_PORT
```

### Erreur de connexion API

Vérifier que `MED_CLIENT_ID` et `MED_CLIENT_SECRET` sont corrects dans `.env.client`.

### Réinitialiser la base

```bash
# ATTENTION : perte de données
docker compose -f docker-compose.client.yml down -v
docker compose -f docker-compose.client.yml up -d
```

---

## Désinstallation

```bash
# Arrêter et supprimer
docker compose -f docker-compose.client.yml down

# Supprimer les données
docker compose -f docker-compose.client.yml down -v
```
