# Feature: Support multi-database

## Contexte

MyElectricalData doit pouvoir fonctionner avec différents types de bases de données selon les besoins de déploiement :
- **SQLite** pour le développement et les petites installations
- **PostgreSQL** pour la production et les installations à grande échelle

## Objectifs

- Supporter SQLite et PostgreSQL de manière transparente
- Détecter automatiquement le type de base de données depuis l'URI de connexion
- Permettre un changement facile entre les deux bases
- Utiliser les mêmes modèles SQLAlchemy pour les deux

## Principes de fonctionnement

### Auto-détection

Le type de base de données est automatiquement détecté depuis `DATABASE_URL` :
- Si l'URI contient `postgresql` → PostgreSQL
- Sinon → SQLite (défaut)

Pas besoin de variable `DATABASE_TYPE` séparée.

### Configuration SQLite

```bash
DATABASE_URL=sqlite+aiosqlite:///./data/myelectricaldata.db
```

**Avantages** :
- Simple, pas de serveur supplémentaire
- Fichier unique dans `apps/api/data/`
- Parfait pour développement et petites installations
- Démarre immédiatement

**Commandes** :
```bash
docker compose up -d
```

### Configuration PostgreSQL

1. **Modifier `.env.api`** :
```bash
DATABASE_URL=postgresql+asyncpg://myelectricaldata:VOTRE_MOT_DE_PASSE@postgres:5432/myelectricaldata
```

2. **Modifier `docker-compose.yml`** :
```yaml
postgres:
  environment:
    POSTGRES_PASSWORD: VOTRE_MOT_DE_PASSE
```

**Important** : Le mot de passe dans `DATABASE_URL` et `docker-compose.yml` doivent correspondre.

**Avantages** :
- Meilleur pour la production
- Performances accrues avec beaucoup d'utilisateurs
- Fonctionnalités avancées (JSONB, full-text search, etc.)
- Backups plus faciles
- Isolation des données dans un volume Docker dédié

**Commandes** :
```bash
# Démarrer avec PostgreSQL
docker compose --profile postgres up -d

# Reconstruire si nécessaire
docker compose --profile postgres up -d --build
```

## Critères d'acceptation

- ✅ Le type de base est détecté automatiquement depuis `DATABASE_URL`
- ✅ SQLite fonctionne par défaut sans configuration supplémentaire
- ✅ PostgreSQL se lance via le profil Docker `--profile postgres`
- ✅ Les mêmes modèles SQLAlchemy fonctionnent avec les deux bases
- ✅ Les migrations Alembic sont compatibles avec les deux
- ✅ Le changement de base nécessite seulement la modification de `DATABASE_URL`

## Migration SQLite → PostgreSQL

1. **Optionnel** : Exporter les données de SQLite si vous voulez les conserver
2. Modifier `.env.api` avec l'URL PostgreSQL
3. Modifier `docker-compose.yml` avec le mot de passe
4. Si changement de mot de passe, supprimer le volume :
   ```bash
   docker compose --profile postgres down -v
   ```
5. Redémarrer :
   ```bash
   docker compose --profile postgres up -d
   ```
6. Les tables sont créées automatiquement au démarrage

## Notes importantes

- **Driver SQLite** : `aiosqlite` (déjà inclus)
- **Driver PostgreSQL** : `asyncpg` (déjà inclus)
- **Volume SQLite** : `./apps/api/data/myelectricaldata.db` (bind mount)
- **Volume PostgreSQL** : `postgres_data` (volume Docker)
- **Changement de mot de passe** : Nécessite `docker compose --profile postgres down -v` pour supprimer l'ancien volume

## Implémentation technique

### Backend

**Fichier** : `apps/api/src/config/settings.py`

```python
class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/myelectricaldata.db"

    @property
    def database_type(self) -> str:
        """Auto-detect database type from DATABASE_URL"""
        if "postgresql" in self.DATABASE_URL:
            return "postgresql"
        return "sqlite"
```

### Docker

**Fichier** : `docker-compose.yml`

Le service PostgreSQL utilise un profil optionnel :
```yaml
postgres:
  profiles:
    - postgres
```

Cela permet de ne pas démarrer PostgreSQL par défaut et de l'activer seulement quand nécessaire.

### Dépendances

**Fichier** : `apps/api/pyproject.toml`

```toml
dependencies = [
    "aiosqlite>=0.20.0",    # SQLite async driver
    "asyncpg>=0.29.0",      # PostgreSQL async driver
    "sqlalchemy[asyncio]>=2.0.36",
]
```

## Troubleshooting

### Erreur d'authentification PostgreSQL

Si vous obtenez `password authentication failed` :
1. Vérifiez que le mot de passe dans `DATABASE_URL` correspond à celui dans `docker-compose.yml`
2. Supprimez le volume PostgreSQL : `docker compose --profile postgres down -v`
3. Redémarrez : `docker compose --profile postgres up -d`

### PostgreSQL n'utilise pas le bon mot de passe

Le mot de passe PostgreSQL est défini **seulement à la première initialisation**. Si vous changez le mot de passe après, vous devez supprimer le volume `postgres_data` pour réinitialiser.
