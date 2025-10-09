# Configuration de la base de données

MyElectricalData supporte deux types de bases de données : **SQLite** (par défaut) et **PostgreSQL**.

Le type de base de données est automatiquement détecté depuis l'URI de connexion, aucune configuration supplémentaire n'est nécessaire.

## SQLite (par défaut)

SQLite est utilisé par défaut. Configuration dans `.env.api` :

```bash
DATABASE_URL=sqlite+aiosqlite:///./data/myelectricaldata.db
```

**Avantages :**

- Simple, pas de serveur supplémentaire
- Parfait pour le développement et les petites installations
- Fichier unique dans `apps/api/data/`

**Commandes :**

```bash
# Démarrer avec SQLite (par défaut)
docker compose up -d
```

## PostgreSQL

Pour une utilisation en production avec plus de performances et de fonctionnalités.

### Configuration

1. Modifier `.env.api` :

```bash
# Commenter SQLite
# DATABASE_URL=sqlite+aiosqlite:///./data/myelectricaldata.db

# Activer PostgreSQL
DATABASE_URL=postgresql+asyncpg://myelectricaldata:VOTRE_MOT_DE_PASSE@postgres:5432/myelectricaldata
```

2. Modifier `docker-compose.yml` pour définir le mot de passe PostgreSQL :

```yaml
postgres:
  environment:
    POSTGRES_PASSWORD: VOTRE_MOT_DE_PASSE
```

**Important :** Le mot de passe dans `DATABASE_URL` et dans `docker-compose.yml` doivent correspondre.

3. Démarrer PostgreSQL avec le profil dédié :

```bash
# Démarrer tous les services + PostgreSQL
docker compose --profile postgres up -d

# Ou reconstruire si nécessaire
docker compose --profile postgres up -d --build
```

**Avantages :**

- Meilleur pour la production
- Performances accrues avec beaucoup d'utilisateurs
- Fonctionnalités avancées (JSONB, full-text search, etc.)
- Backups plus faciles

### Migration de SQLite vers PostgreSQL

1. Exporter les données de SQLite
2. Changer la configuration vers PostgreSQL
3. Redémarrer avec `docker compose --profile postgres up -d`
4. Les tables seront créées automatiquement
5. Importer les données (si nécessaire)

### Migration de SQLite vers PostgreSQL

1. Exporter les données de SQLite (optionnel si vous voulez conserver les données)
2. Modifier `.env.api` pour pointer vers PostgreSQL
3. Modifier `docker-compose.yml` avec le mot de passe
4. Si vous changez de mot de passe PostgreSQL, vous devez **supprimer le volume** :

   ```bash
   docker compose --profile postgres down -v
   ```

5. Redémarrer avec `docker compose --profile postgres up -d`
6. Les tables seront créées automatiquement au démarrage

### Retour à SQLite

1. Modifier `.env.api` pour remettre l'URL SQLite
2. Redémarrer normalement : `docker compose up -d`

## Volumes Docker

- **SQLite** : `./apps/api/data/myelectricaldata.db`
- **PostgreSQL** : volume Docker `postgres_data`

## Notes importantes

- Le type de base de données est **auto-détecté** depuis `DATABASE_URL` (pas de variable `DATABASE_TYPE`)
- Le changement de base de données nécessite un redémarrage du backend
- Les deux bases utilisent les mêmes modèles SQLAlchemy
- Les migrations Alembic fonctionnent avec les deux
- **Important** : Si vous changez le mot de passe PostgreSQL dans `docker-compose.yml`, vous devez supprimer le volume avec `docker compose --profile postgres down -v` sinon PostgreSQL utilisera l'ancien mot de passe
