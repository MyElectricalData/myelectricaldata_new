# Modes d'exécution : Serveur vs Client

**IMPORTANT : Ce projet supporte DEUX modes d'exécution distincts. Le mode Client est le défaut. Toute modification doit prendre en compte l'impact sur les deux modes.**

## Vue d'ensemble

| Aspect              | Mode Client (défaut)                     | Mode Serveur                  |
| ------------------- | ---------------------------------------- | ----------------------------- |
| **Fichier compose** | `docker-compose.yml`                     | `docker-compose.server.yml`   |
| **Config env**      | `.env.local-client`                      | `.env.api`                    |
| **Ports**           | Frontend: 8100, Backend: 8181            | Frontend: 8000, Backend: 8081 |
| **Source données**  | API v2.myelectricaldata.fr               | Enedis API direct             |
| **Stockage**        | PostgreSQL (indéfini)                    | Cache Valkey (24h)            |
| **Multi-users**     | Non (mono-user)                          | Oui                           |
| **Administration**  | Aucune                                   | Complète                      |
| **Exports**         | Home Assistant, MQTT, VM, Jeedom         | Non                           |

## Règles de développement

### Backend (`apps/api/`)

**Avant toute modification de router ou service, vérifier :**

1. Le router est-il utilisé dans les deux modes ?
2. Le service dépend-il de Valkey (serveur) ou PostgreSQL seul (client) ?
3. Y a-t-il des adaptateurs différents (Enedis vs MyElectricalData API) ?

```python
# Pattern pour code conditionnel
from config.settings import settings

# Le mode client est le défaut (SERVER_MODE=False)
# CLIENT_MODE est une propriété calculée : return not SERVER_MODE
if settings.CLIENT_MODE:
    # Code spécifique mode client (défaut)
    adapter = MyElectricalDataAdapter()
else:
    # Code spécifique mode serveur (SERVER_MODE=True)
    adapter = EnedisAdapter()
```

### Frontend (`apps/web/`)

**Avant toute modification de page ou composant, vérifier :**

1. La page existe-t-elle dans les deux modes ?
2. Les routes sont-elles différentes ?
3. Les appels API sont-ils les mêmes ?

```typescript
// Pattern pour routes conditionnelles
// Le mode client est le défaut (VITE_SERVER_MODE not set or false)
const isServerMode = import.meta.env.VITE_SERVER_MODE === "true";

const routes = isServerMode ? serverRoutes : clientRoutes;
```

### Pages par mode

| Page                | Serveur |     Client      |
| ------------------- | :-----: | :-------------: |
| Landing (/)         |   ✅    | ❌ → /dashboard |
| Signup/Login        |   ✅    |       ❌        |
| Dashboard           |   ✅    |       ✅        |
| Consommation (kWh)  |   ✅    |       ✅        |
| Consommation (Euro) |   ✅    |       ✅        |
| Production          |   ✅    |       ✅        |
| Bilan               |   ✅    |       ✅        |
| Contribuer          |   ✅    |       ✅        |
| Tempo               |   ✅    |       ✅        |
| EcoWatt             |   ✅    |       ✅        |
| **France**          |   ✅    |       ✅        |
| Simulateur          |   ✅    |       ❌        |
| FAQ                 |   ✅    |       ❌        |
| Paramètres          |   ✅    |       ❌        |
| Admin/\*            |   ✅    |       ❌        |
| **Exporter**        |   ❌    |       ✅        |

### Routers par mode

| Router                   | Serveur |    Client    | Notes                 |
| ------------------------ | :-----: | :----------: | --------------------- |
| `accounts.py`            |   ✅    |      ❌      | Auth locale           |
| `admin.py`               |   ✅    |      ❌      | Gestion users         |
| `pdl.py`                 |   ✅    | ✅ (lecture) | CRUD vs Read-only     |
| `enedis.py`              |   ✅    |      ❌      | Accès direct Enedis   |
| `enedis_client.py`       |   ❌    |      ✅      | Local-first + gateway |
| `tempo.py`               |   ✅    |      ✅      | RTE vs SyncService    |
| `ecowatt.py`             |   ✅    |      ✅      | RTE vs SyncService    |
| `consumption_france.py`  |   ✅    |      ✅      | RTE vs SyncService    |
| `generation_forecast.py` |   ✅    |      ✅      | RTE vs SyncService    |
| `contribute.py`          |   ✅    |      ✅      | Local vs API distante |
| `sync.py`                |   ❌    |      ✅      | Sync depuis API       |
| `export.py`              |   ❌    |      ✅      | Configuration exports |

### Services spécifiques au mode client

| Service            | Fichier                  | Rôle                                                    |
| ------------------ | ------------------------ | ------------------------------------------------------- |
| `LocalDataService` | `services/local_data.py` | Lecture données locales PostgreSQL                      |
| `SyncService`      | `services/sync.py`       | Sync depuis gateway (PDL, Tempo, EcoWatt, France, etc.) |
| `SyncScheduler`    | `scheduler.py`           | Tâches planifiées (pas d'appel RTE direct)              |

### Stratégie Local-First (mode client)

En mode client, les endpoints de données utilisent une stratégie **local-first** :

1. Vérifier PostgreSQL local pour les données demandées
2. Identifier les "trous" (plages de dates manquantes)
3. Appeler la gateway **uniquement** pour les données manquantes
4. Combiner et retourner les résultats

```python
# Exemple dans enedis_client.py
local_data, missing_ranges = await local_service.get_consumption_daily(pdl, start, end)
if not missing_ranges:
    return local_data  # Aucun appel gateway !
# Fetch uniquement les plages manquantes
for range_start, range_end in missing_ranges:
    gateway_data = await adapter.get_consumption_daily(pdl, range_start, range_end)
```

### Scheduler : Serveur vs Client

| Job           | Mode Serveur                                  | Mode Client                                    |
| ------------- | --------------------------------------------- | ---------------------------------------------- |
| Tempo sync    | `rte_service.update_tempo_cache()`            | `sync_service.sync_tempo()` (gateway)          |
| EcoWatt sync  | `rte_service.update_ecowatt_cache()`          | `sync_service.sync_ecowatt()` (gateway)        |
| France sync   | `rte_service.update_consumption_france...()`  | `sync_service.sync_consumption_france()` (gw)  |
| Gen. forecast | `rte_service.update_generation_forecast...()` | `sync_service.sync_generation_forecast()` (gw) |
| PDL sync      | N/A                                           | `sync_service.sync_all()`                      |

**Important** : `start_background_tasks()` n'est appelé qu'en mode serveur. En mode client, seul `SyncScheduler` est démarré.

## Checklist avant commit

- [ ] Le code fonctionne-t-il en mode serveur ?
- [ ] Le code fonctionne-t-il en mode client ?
- [ ] Les variables d'environnement sont-elles documentées pour les deux modes ?
- [ ] Les tests couvrent-ils les deux modes si applicable ?
- [ ] La documentation a-t-elle été mise à jour (`docs/` et `docs/local-client/`) ?

## Documentation par mode

### Mode Serveur

**Documentation principale** : `docs/server-mode/`

| Type                      | Emplacement                           | Contenu                                                   |
| ------------------------- | ------------------------------------- | --------------------------------------------------------- |
| Introduction              | `docs/server-mode/index.md`           | Vue d'ensemble du mode serveur                            |
| Architecture              | `docs/server-mode/architecture.md`    | Architecture système, flux de données                     |
| Authentification          | `docs/server-mode/authentication.md`  | OAuth2, JWT, gestion des tokens                           |
| Chiffrement               | `docs/server-mode/encryption.md`      | Fernet, chiffrement des données utilisateur               |
| Installation              | `docs/server-mode/installation/`      | Docker, Helm, configuration                               |
| Administration            | `docs/server-mode/administration/`    | Gestion users, offers, logs, database, Slack              |
| Fonctionnalités           | `docs/server-mode/features/`          | Frontend, account, gateway, cache, database, simulator... |
| Offres & Scrapers         | `docs/server-mode/offers/`            | Documentation des scrapers de prix par fournisseur        |
| Compte de Démonstration   | `docs/server-mode/demo/`              | Création et gestion des comptes demo                      |

### Mode Client

**Documentation principale** : `docs/local-client/`

| Type           | Emplacement                           | Contenu                                           |
| -------------- | ------------------------------------- | ------------------------------------------------- |
| Introduction   | `docs/local-client/index.md`          | Vue d'ensemble du mode client local               |
| Installation   | `docs/local-client/installation/`     | Docker, Helm, configuration                       |
| Configuration  | `docs/local-client/configuration.md`  | Variables d'environnement, réglages               |
| Interface Web  | `docs/local-client/interface.md`      | Guide d'utilisation de l'interface                |
| Exporteurs     | `docs/local-client/exporters.md`      | Vue d'ensemble des exporteurs disponibles         |
| Intégrations   | `docs/local-client/integrations/`     | Home Assistant, MQTT, VictoriaMetrics, etc.       |
| Architecture   | `docs/local-client/architecture.md`   | Architecture local-first, sync avec gateway       |

### Documentation commune (les deux modes)

| Type               | Emplacement                  | Contenu                                                |
| ------------------ | ---------------------------- | ------------------------------------------------------ |
| Pages UI           | `docs/specs/pages/`          | Spécifications des pages web (Dashboard, Tempo, etc.)  |
| Design System      | `docs/specs/design/`         | Guidelines UI, composants, couleurs, typographie       |
| API Enedis         | `docs/external-apis/enedis-api/` | Documentation complète API Enedis DataHub          |
| API RTE            | `docs/external-apis/rte-api/`    | Documentation API RTE (Tempo, EcoWatt, etc.)       |

### Règle de consultation

**Avant toute modification, consulter la documentation du mode concerné :**

- Modification backend/frontend → Vérifier `docs/specs/pages/` pour la page concernée
- Modification mode serveur → Consulter `docs/server-mode/`
- Modification mode client → Consulter `docs/local-client/`
- Intégration API externe → Consulter `docs/external-apis/`

## Questions à poser

Quand l'utilisateur demande une modification, clarifier :

1. "Cette modification concerne-t-elle le mode serveur, client, ou les deux ?"
2. "Faut-il adapter le comportement selon le mode ?"
