# Feature: Base de données PostgreSQL

## Contexte

La passerelle (mode serveur) est multi-utilisateurs : comptes, PDL, jetons Enedis, rôles et permissions, offres des fournisseurs et contributions vivent dans une base partagée par toutes les requêtes. Elle tourne sur **PostgreSQL**, en production comme en développement.

:::info Client local
SQLite n'est pris en charge que par le **client local** (mode client), où il est recommandé pour une nouvelle installation : voir [Installation Docker du client local](../../local-client/installation/docker.md). Sans `DATABASE_URL`, le code retombe sur un fichier SQLite, valeur prévue pour ce client : une passerelle sur SQLite n'est ni testée ni prise en charge, renseignez toujours une URL PostgreSQL.
:::

## Objectifs

- Une seule base PostgreSQL pour toutes les instances du backend de la passerelle
- Une URL de connexion unique, `DATABASE_URL`, au format `postgresql+asyncpg://`
- Un schéma tenu par les migrations Alembic, appliquées à chaque démarrage
- Les mêmes modèles SQLAlchemy que le client local

## Principes de fonctionnement

### Connexion

Le backend lit `DATABASE_URL` et se connecte avec le pilote asynchrone `asyncpg` :

```bash
DATABASE_URL=postgresql+asyncpg://myelectricaldata:VOTRE_MOT_DE_PASSE@postgres:5432/myelectricaldata
```

PostgreSQL n'est pas démarré par `docker-compose.server.yml` : il est fourni à part (serveur existant, service managé, ou PostgreSQL du chart Helm).

### Initialisation du schéma

Au démarrage du conteneur, `entrypoint.sh` exécute `alembic upgrade head`, puis l'application crée les tables manquantes et les données initiales (rôles et permissions, offres par défaut, droits des comptes listés dans `ADMIN_EMAILS`). Aucune commande n'est nécessaire sur une base vide.

### Déploiement

| Méthode | Base PostgreSQL | Où régler la connexion |
|---------|-----------------|------------------------|
| Docker Compose (`docker-compose.server.yml`) | À fournir | `DATABASE_URL` dans `apps/api/.env.docker` |
| Helm, `postgres.enabled: true` (défaut) | PostgreSQL 16 déployé par le chart | `postgres.auth.*` |
| Helm, `postgres.enabled: false` | Serveur externe | `externalDatabase.*` |

Avec Helm, le chart construit lui-même `DATABASE_URL` au format `postgresql+asyncpg://` dans les deux cas.

## Critères d'acceptation

- ✅ Le backend de la passerelle se connecte à PostgreSQL via `DATABASE_URL` (`postgresql+asyncpg://`)
- ✅ Les migrations Alembic s'appliquent seules au démarrage du conteneur
- ✅ Le compose serveur et le chart Helm ne proposent que PostgreSQL

## Notes importantes

- **Driver PostgreSQL** : `asyncpg` (inclus dans l'image)
- **`DATABASE_URL` obligatoire** : sa valeur par défaut dans `settings.py` vise le client local, pas la passerelle
- **Mot de passe** : avec l'image officielle `postgres`, le mot de passe n'est appliqué qu'à la première initialisation du volume. Le changer ensuite se fait dans PostgreSQL (`ALTER USER`), puis dans `DATABASE_URL`.

## Implémentation technique

### Backend

**Fichier** : `apps/api/src/models/database.py`

```python
engine = make_engine(settings.DATABASE_URL)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

`make_engine` crée un moteur SQLAlchemy asynchrone ; le pilote est choisi d'après l'URL.

### Chart Helm

**Fichier** : `helm/myelectricaldata-server/templates/_helpers.tpl` (`myelectricaldata.databaseUrl`)

```
postgresql+asyncpg://<utilisateur>:$(POSTGRES_PASSWORD)@<hôte>:<port>/<base>
```

L'hôte est le service PostgreSQL du chart, ou `externalDatabase.host` quand `postgres.enabled` vaut `false`. Le mot de passe vient d'un secret, injecté par la variable `POSTGRES_PASSWORD`.

### Dépendances

**Fichier** : `apps/api/pyproject.toml` (extrait)

```toml
dependencies = [
    "asyncpg>=0.29.0",      # PostgreSQL async driver
    "sqlalchemy[asyncio]>=2.0.36",
]
```

## Troubleshooting

### Erreur d'authentification PostgreSQL

Si vous obtenez `password authentication failed` :
1. Vérifiez l'utilisateur et le mot de passe de `DATABASE_URL` (ou de `postgres.auth` / `externalDatabase` avec Helm)
2. Avec un PostgreSQL embarqué dont le volume existe déjà, le mot de passe d'origine reste en vigueur : alignez `DATABASE_URL` dessus, ou changez-le dans PostgreSQL

### Le backend ne démarre pas

Les logs du backend montrent l'étape `Applying database migrations...` : une erreur à ce moment vient de la connexion à PostgreSQL ou d'une migration. Vérifiez que la base est joignable depuis le conteneur, puis consultez [Administration › Base de Données](../administration/database.md).
