---
name: 03-execute
description: Implementer les modifications
prev_step: steps/02-plan.md
next_step: steps/04-lint.md
---

# Step 3/7 : Executer

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 STEP 3/7 - IMPLEMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Agents disponibles

### Frontend

| Agent                 | Description                                                    | Outils                       |
| --------------------- | -------------------------------------------------------------- | ---------------------------- |
| `frontend-specialist` | Constructeur UI React/Vite. Mises en page responsives, states. | Read, Edit, Grep, Glob, Bash |

**Utiliser pour** : Composants React, pages, styles, gestion d'etat, mises en page responsives.

### Backend

| Agent                | Description                                   | Outils                       |
| -------------------- | --------------------------------------------- | ---------------------------- |
| `backend-specialist` | Concepteur d'API Python. Endpoints et donnees | Read, Edit, Grep, Glob, Bash |

**Utiliser pour** : Endpoints FastAPI, modeles SQLAlchemy, services, logique metier.

### Integration Enedis

| Agent               | Description                                                      | Outils                       |
| ------------------- | ---------------------------------------------------------------- | ---------------------------- |
| `enedis-specialist` | Expert API Enedis Data Connect. Integration et appels API Enedis | Read, Edit, Grep, Glob, Bash |

**Utiliser pour** : Appels API Enedis, adaptateurs, gestion des tokens OAuth, cache des donnees Enedis.

### DevOps

| Agent               | Description                                               | Outils                       |
| ------------------- | --------------------------------------------------------- | ---------------------------- |
| `devops-specialist` | Ingenieur DevOps Kubernetes. Helm, CI/CD et observabilite | Read, Edit, Grep, Glob, Bash |

**Utiliser pour** : Docker, Kubernetes, Helm charts, CI/CD, monitoring.

### Home Assistant

| Agent                       | Description                                         | Outils                       |
| --------------------------- | --------------------------------------------------- | ---------------------------- |
| `home-assistant-specialist` | Specialiste de la solution domotique Home Assistant | Read, Edit, Grep, Glob, Bash |

**Utiliser pour** : Integration Home Assistant, configuration YAML, sensors, automations.

## Selection de l'agent

| Type de modification                     | Agent recommande            |
| ---------------------------------------- | --------------------------- |
| Interface, composants, design            | `frontend-specialist`       |
| API, base de donnees, logique metier     | `backend-specialist`        |
| Integration API Enedis                   | `enedis-specialist`         |
| Docker, Kubernetes, deploiement          | `devops-specialist`         |
| Integration Home Assistant (mode client) | `home-assistant-specialist` |

## Regles importantes

1. **Design** : Respecter `docs/specs/design/checklist.md`
2. **Notifications** : Utiliser `toast.*` de `@/stores/notificationStore`
3. **Modes** : Verifier compatibilite serveur/client si applicable (voir frontmatter)
4. **Types** : Mettre a jour `apps/web/src/types/api.ts` si nouveau type API
5. **Enedis** : Consulter `docs/external-apis/enedis-api/` avant toute modification liee a Enedis

## Recap Step 3

**Afficher a la fin de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ STEP 3/7 - IMPLEMENTATION TERMINEE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Features implementees : <X>/<Y>
Fichiers modifies     : <liste>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Passage au Step 4 : Lint
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
