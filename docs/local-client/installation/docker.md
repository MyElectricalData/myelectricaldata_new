# Installation Docker

Installez le client local en **un seul conteneur** : l'interface et l'API sont réunies dans une même image, avec une seule adresse et un seul volume.

## Prérequis

- Docker 24+ et Docker Compose v2
- Vos identifiants MyElectricalData (`client_id` et `client_secret`), visibles dans **Paramètres > API** de [www.v2.myelectricaldata.fr](https://www.v2.myelectricaldata.fr)
- Accès réseau vers `www.v2.myelectricaldata.fr`
- Une machine **amd64** (x86_64) ou **arm64** (Raspberry Pi 4 ou 5 avec un système 64 bits, voir [Raspberry Pi](#installation-sur-raspberry-pi))

L'image `ghcr.io/myelectricaldata/myelectricaldata_new/client` est publique : aucun compte GitHub ni `docker login` n'est nécessaire.

```bash
# Vérifier les versions
docker --version
docker compose version
```

## Installation

### Étape 1 : Récupérer le fichier compose

Un seul fichier suffit, inutile de cloner le dépôt :

```bash
mkdir myelectricaldata && cd myelectricaldata
curl -O https://raw.githubusercontent.com/MyElectricalData/myelectricaldata_new/main/docker-compose.client.yml
```

### Étape 2 : Renseigner vos identifiants

Créez un fichier `.env` à côté du compose (Docker Compose le lit automatiquement) :

```bash
# === OBLIGATOIRE ===
# Identifiants API MyElectricalData (depuis votre compte)
MED_CLIENT_ID=cli_xxxxxxxxxxxxxxxxxxxxxxxxx
MED_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# === RECOMMANDÉ (avant le premier démarrage) ===
# Clé de signature des sessions, à générer :
#   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
# Vide : clé aléatoire à chaque démarrage (sessions perdues au redémarrage)
SECRET_KEY=

# === OPTIONNEL ===
TZ=Europe/Paris
# Port de l'interface sur votre machine (défaut 8100)
CLIENT_PORT=8100
```

Le modèle complet et commenté est `.env.local-client.example` dans le [dépôt](https://github.com/MyElectricalData/myelectricaldata_new/blob/main/.env.local-client.example).

### Étape 3 : Démarrer

```bash
docker compose -f docker-compose.client.yml up -d
```

Au premier démarrage, l'API crée la base (fichier `/app/data/myelectricaldata.db`, dans le volume `myelectricaldata_data`) et son schéma. Le conteneur passe `healthy` quand l'interface et l'API répondent (`docker compose -f docker-compose.client.yml ps`).

### Étape 4 : Ouvrir l'interface

```bash
# Logs
docker compose -f docker-compose.client.yml logs -f

# Accéder à l'interface
open http://localhost:8100
```

Seule l'adresse http://localhost:8100 est à ouvrir : l'API répond sous http://localhost:8100/api.

:::tip PostgreSQL existant
Pour utiliser votre propre serveur PostgreSQL plutôt que SQLite, renseignez `DATABASE_URL` dans `.env` (format `postgresql+asyncpg://utilisateur:motdepasse@hote:5432/base`). L'hôte doit être joignable depuis le conteneur.
:::

:::info Portainer
`docker-compose.client.yml` peut être déployé tel quel comme stack Portainer : renseignez `MED_CLIENT_ID` et `MED_CLIENT_SECRET` dans les variables d'environnement de la stack. Aucun autre fichier n'est nécessaire.
:::

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

:::info Images multi-architecture
Les images sont publiées pour **linux/amd64** et **linux/arm64** : Docker télécharge automatiquement celle qui correspond à la machine, l'installation est la même que sur un PC. Un système **32 bits** (ARMv7, `armv7l`) n'est pas pris en charge : installez un Raspberry Pi OS 64 bits.
:::

```bash
# Vérifier l'architecture : aarch64 (Raspberry Pi 64 bits) ou x86_64 (PC)
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
docker compose -f docker-compose.client.yml logs -f client

# Redémarrer
docker compose -f docker-compose.client.yml restart client

# Appliquer une modification du .env (restart ne relit pas le fichier)
docker compose -f docker-compose.client.yml up -d
```

---

## Mise à jour

```bash
# Télécharger la nouvelle image et recréer le conteneur
docker compose -f docker-compose.client.yml pull
docker compose -f docker-compose.client.yml up -d
```

L'API applique les migrations de la base au démarrage.

---

## Passer de deux conteneurs à un seul

Cette section concerne les installations existantes faites avec `docker-compose.sqlite.yml` (services `backend` et `frontend`). Dans le **même dossier** : le nom du projet compose (celui du dossier) ne change pas, donc le volume `myelectricaldata_data` et sa base SQLite sont repris tels quels.

```bash
# Récupérer le nouveau fichier compose (ou git pull si vous aviez cloné le dépôt)
curl -O https://raw.githubusercontent.com/MyElectricalData/myelectricaldata_new/main/docker-compose.client.yml
docker compose -f docker-compose.client.yml pull
# Crée le conteneur client et retire les anciens conteneurs backend et frontend
docker compose -f docker-compose.client.yml up -d --remove-orphans
```

- Le port de l'interface reste **8100** par défaut. Le nouveau compose lit `CLIENT_PORT` (et non plus `CLIENT_FRONTEND_PORT`) : si vous aviez changé `CLIENT_FRONTEND_PORT`, reportez sa valeur dans `CLIENT_PORT`.
- Le port **8181** de l'API disparaît : un script, Home Assistant ou un autre outil qui appelait `http://<hôte>:8181/api/...` doit passer par `http://<hôte>:8100/api/...` (même chemin).
- Retour arrière : `docker compose -f docker-compose.sqlite.yml up -d --remove-orphans` (même volume).

Depuis `docker-compose.yml` (PostgreSQL embarqué) : la base PostgreSQL n'est pas reprise par l'image client seule. Gardez `docker-compose.yml`, ou repartez sur SQLite avec `docker-compose.client.yml` (resynchronisation depuis la passerelle), après une [sauvegarde](#postgresql).

---

## Options avancées, installations en deux conteneurs

Ces fichiers restent fournis pour les installations existantes. Pour une nouvelle installation, préférez `docker-compose.client.yml` ci-dessus.

| Fichier | Base | Services | Pour qui |
|---------|------|----------|----------|
| `docker-compose.sqlite.yml` | SQLite (même volume `myelectricaldata_data`) | `backend`, `frontend` | Installation existante en deux conteneurs |
| `docker-compose.yml` | PostgreSQL 16 embarqué (volume `postgres_data`) | `postgres`, `backend`, `frontend` | Installation existante, ou besoin d'un PostgreSQL embarqué |

Variables propres à ces fichiers, à ajouter dans `.env` au besoin :

```bash
# Ports en deux conteneurs (docker-compose.sqlite.yml et docker-compose.yml)
CLIENT_FRONTEND_PORT=8100
CLIENT_BACKEND_PORT=8181

# docker-compose.yml seulement : mot de passe de la base PostgreSQL embarquée
# (lettres, chiffres, - _ . ~ seulement : il est repris tel quel dans l'URL de connexion)
POSTGRES_PASSWORD=un-mot-de-passe-solide
```

Dans les commandes de cette page, remplacez `docker-compose.client.yml` par `docker-compose.sqlite.yml` (ou `docker-compose.yml`) et le service `client` par `backend`. Ces compose nécessitent le dépôt cloné (`git clone https://github.com/MyElectricalData/myelectricaldata_new.git`) et `cp .env.local-client.example .env`.

---

## Sauvegarde

### SQLite

La copie passe par SQLite lui-même (cohérente même pendant une synchronisation), puis sort du conteneur :

```bash
docker compose -f docker-compose.client.yml exec client python -c "import sqlite3; sqlite3.connect('/app/data/myelectricaldata.db', timeout=30).backup(sqlite3.connect('/app/data/backup.db'))"
docker compose -f docker-compose.client.yml cp client:/app/data/backup.db ./backup.db
docker compose -f docker-compose.client.yml exec client rm /app/data/backup.db
```

Restauration, conteneur démarré (SQLite réécrit la base en place, puis le redémarrage repart d'un état propre) :

```bash
docker compose -f docker-compose.client.yml cp ./backup.db client:/app/data/restore.db
docker compose -f docker-compose.client.yml exec client python -c "import sqlite3; sqlite3.connect('/app/data/restore.db').backup(sqlite3.connect('/app/data/myelectricaldata.db', timeout=30))"
docker compose -f docker-compose.client.yml exec client rm /app/data/restore.db
docker compose -f docker-compose.client.yml restart client
```

:::warning Ne pas copier le fichier par-dessus la base
La base tourne en mode WAL : des écritures récentes vivent dans `myelectricaldata.db-wal`. Remplacer `myelectricaldata.db` par une copie, même conteneur arrêté, laisse ce fichier en place et SQLite le rejoue sur la base restaurée (données perdues ou base corrompue). Passez toujours par la commande ci-dessus.
:::

### PostgreSQL

```bash
docker compose -f docker-compose.yml exec postgres \
  pg_dump -U myelectricaldata myelectricaldata_client > backup.sql
```

Restauration :

```bash
docker compose -f docker-compose.yml exec -T postgres \
  psql -U myelectricaldata myelectricaldata_client < backup.sql
```

---

## Dépannage

### Le conteneur ne démarre pas ou redémarre en boucle

```bash
# Vérifier les logs (interface et API dans le même flux)
docker compose -f docker-compose.client.yml logs client

# Port déjà utilisé ? Modifier CLIENT_PORT
```

Si l'interface ou l'API s'arrête, le conteneur s'arrête avec elle et Docker le relance (`restart: unless-stopped`) : la cause est dans les dernières lignes des logs.

### Erreur de connexion API

Vérifier que `MED_CLIENT_ID` et `MED_CLIENT_SECRET` sont corrects dans `.env`, puis `docker compose -f docker-compose.client.yml up -d`.

### Erreur 405 ou page d'accueil à la place de l'API

Les appels `/api` doivent atteindre l'API. Avec `docker-compose.client.yml`, c'est interne au conteneur : mettre l'image à jour (`docker compose pull`). En deux conteneurs, vérifier que le service `frontend` a bien `API_PROXY_URL=http://backend:8000` et que l'image frontend est à jour.

### `denied` au téléchargement des images

Les images doivent être `ghcr.io/myelectricaldata/myelectricaldata_new/client` (ou `.../backend` et `.../frontend`). Un ancien compose dont les images n'ont pas le suffixe `_new` vise un registre privé : mettre à jour le dépôt (`git pull`) ou corriger les deux lignes `image:`.

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
