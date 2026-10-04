---
globs:
  - apps/api/src/adapters/enedis.py
  - apps/api/src/routers/enedis.py
  - "**/enedis*.py"
  - apps/web/src/utils/enedisMeasure.ts
---

# Integration API Enedis

**IMPORTANT : Pour toute modification liee a l'API Enedis, utiliser l'agent `enedis-specialist` qui a acces a la documentation complete.**

## Rappels critiques

- Donnees disponibles jusqu'a **J-1** uniquement
- Courbes de charge : **7 jours max** par appel
- `start` doit etre **strictement inferieur** a `end` (Data Connect 2026 : `dateFin` exclue)
- **5 req/s** et **1000 req/h par API** (Data Connect 2026)

## Data Connect 2026

- Les API v5 (`metering_data_*`, `customers_*`) sont remplacees par Data Connect 2026 ; mode pilote par `ENEDIS_API_MODE` (`legacy`, `new`, `auto`).
- Le reste du code ne voit **qu'un format** (2026, `grandeur[].points[]`) : toute reponse v5 se convertit dans `adapters/enedis_format.py`, jamais dans un router.
- Front : lire les reponses **uniquement** via `apps/web/src/utils/enedisMeasure.ts`, jamais `grandeur[0].points` en direct.
- API ITC (contrat, adresse) : PRM dans le **chemin** (en query, Enedis repond 500).
- Reference : `docs/external-apis/enedis-api/data-connect-2026/README.md`.

## Documentation

`docs/external-apis/enedis-api/` contient la documentation complete (endpoints, erreurs, OpenAPI v5, Swagger Data Connect 2026 dans `data-connect-2026/`).
