# Développement

Ce dossier contient les fichiers Docker Compose pour le **développement local** avec hot-reload et tous les services satellites.

## Différence avec les fichiers racine

| Fichier | Usage | Services inclus |
|---------|-------|-----------------|
| `docker-compose.yml` (racine) | **Production** | Backend, Frontend uniquement (images GHCR) |
| `docker-compose.server.yml` (racine) | **Production** | Backend, Frontend uniquement (images GHCR) |
| `dev/docker-compose.yml` | Développement | Backend, Frontend, PostgreSQL, VictoriaMetrics, pgAdmin |
| `dev/docker-compose.server.yml` | Développement | Backend, Frontend, PostgreSQL, Valkey, pgAdmin, Docs |

## Mode Client (Développement)

```bash
# Depuis la racine du projet
docker compose -f dev/docker-compose.yml up -d

# Logs
docker compose -f dev/docker-compose.yml logs -f

# Arrêt
docker compose -f dev/docker-compose.yml down
```

### Ports

| Service | URL |
|---------|-----|
| Frontend | <http://localhost:8100> |
| Backend API | <http://localhost:8181> |
| VictoriaMetrics | <http://localhost:8428> |
| pgAdmin | <http://localhost:5051> |

## Mode Serveur (Développement)

```bash
# Depuis la racine du projet
docker compose -f dev/docker-compose.server.yml up -d

# Logs
docker compose -f dev/docker-compose.server.yml logs -f

# Arrêt
docker compose -f dev/docker-compose.server.yml down
```

### Ports

| Service | URL |
|---------|-----|
| Frontend | <http://localhost:8000> |
| Backend API | <http://localhost:8081> |
| pgAdmin | <http://localhost:5050> |
| Documentation | <http://localhost:8002> (avec profile `docs`) |

## Fonctionnalités développement

- **Hot-reload** : Les modifications de code sont détectées automatiquement
- **Volumes** : Le code source est monté en volume pour édition live
- **Services satellites** : PostgreSQL, Valkey, VictoriaMetrics, pgAdmin inclus
- **Profiles** : `debug` pour pgAdmin (client), `docs` pour la documentation (serveur)

## Configuration

Les fichiers `.env.*` sont attendus à la **racine du projet** :

| Fichier | Mode | Description |
|---------|------|-------------|
| `.env.local-client` | Client dev | Configuration client développement |
| `.env.api` | Serveur dev | Configuration serveur développement |
| `.env.web` | Serveur dev | Variables frontend serveur |
