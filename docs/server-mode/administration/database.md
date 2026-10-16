---
sidebar_position: 4
---

# Base de Données

MyElectricalData en mode serveur (la passerelle) fonctionne sur **PostgreSQL**. La connexion se règle par une seule variable, `DATABASE_URL`, au format `postgresql+asyncpg://`.

:::info Client local
SQLite n'est pris en charge que par le **client local**, pas par la passerelle : voir [Installation Docker du client local](../../local-client/installation/docker.md). Sans `DATABASE_URL`, le backend retombe sur un fichier SQLite prévu pour ce client : sur la passerelle, renseignez toujours une URL PostgreSQL.
:::

## Docker Compose

`docker-compose.server.yml` ne démarre que le backend et le frontend : PostgreSQL est à fournir (serveur existant ou service managé).

1. Renseigner l'URL dans `apps/api/.env.docker` :

```bash
DATABASE_URL=postgresql+asyncpg://myelectricaldata:VOTRE_MOT_DE_PASSE@<hote-postgres>:5432/myelectricaldata
```

2. Démarrer (ou redémarrer) le backend :

```bash
docker compose -f docker-compose.server.yml --env-file apps/api/.env.docker up -d
```

Le mot de passe ne doit contenir que des lettres, des chiffres et `- _ . ~` : `@ / : # ?` cassent l'URL, et leur encodage (`%40`...) fait échouer les migrations au démarrage (`alembic/env.py` passe l'URL telle quelle à `ConfigParser`, qui rejette le `%`).

Installation complète : [Installation Docker](../installation/docker.md).

## Helm

Le chart `myelectricaldata-server` construit lui-même `DATABASE_URL` :

- **`postgres.enabled: true`** (défaut) : PostgreSQL 16 déployé par le chart, identifiants dans `postgres.auth` (`password`, ou `existingSecret`), volume persistant conservé à la désinstallation.
- **`postgres.enabled: false`** : serveur externe décrit par `externalDatabase` (`host`, `port`, `database`, `username`, `password` ou `existingSecret`).

```yaml
postgres:
  enabled: false

externalDatabase:
  host: postgres.example.com
  port: 5432
  database: myelectricaldata
  username: myelectricaldata
  existingSecret: myelectricaldata-db   # clé : password
```

Le chart insère le mot de passe tel quel dans l'URL : il ne doit contenir que des lettres, chiffres et `- _ . ~`.

Détails : [Installation Helm](../installation/helm.md).

## Migrations

Le conteneur du backend exécute `alembic upgrade head` à chaque démarrage, puis crée les données initiales (rôles, offres par défaut, administrateurs de `ADMIN_EMAILS`). Une base vide ne demande aucune action. Pour relancer les migrations à la main :

```bash
docker compose -f docker-compose.server.yml --env-file apps/api/.env.docker exec backend alembic upgrade head
```

## Sauvegarde et restauration

```bash
# Sauvegarde
pg_dump -h <hote-postgres> -U myelectricaldata myelectricaldata > backup.sql

# Restauration
psql -h <hote-postgres> -U myelectricaldata myelectricaldata < backup.sql
```

Avec le PostgreSQL du chart Helm, lancer les mêmes commandes dans son pod (`kubectl exec`).

## Changer le mot de passe

L'image `postgres` n'applique `POSTGRES_PASSWORD` qu'à la première initialisation de son volume. Pour changer le mot de passe d'une base existante :

1. Le changer dans PostgreSQL : `ALTER USER myelectricaldata WITH PASSWORD 'nouveau';`
2. Reporter la nouvelle valeur dans `DATABASE_URL` (Docker), ou dans `postgres.auth` / le secret (Helm)
3. Redémarrer le backend

Supprimer le volume de PostgreSQL réinitialise aussi le mot de passe, mais **efface toutes les données** de la passerelle.

## Notes importantes

- Les modèles SQLAlchemy et les migrations Alembic sont communs à la passerelle et au client local
- Le changement de `DATABASE_URL` nécessite un redémarrage du backend
- Le pilote `asyncpg` est inclus dans l'image du backend
