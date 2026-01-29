---
name: web
description: SKILL - Le but de ce skill est de gérer les pages web du front.
argument-hint: "<page-name> [--bug|-b] [--new|-n] [--design|-d] [--validate|-v] <description>"
auto_continue: true
allowed_tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
file_patterns:
  - "apps/web/src/pages/**/*"
  - "apps/web/src/api/**/*"
  - "apps/api/src/routers/**/*"
  - "docs/specs/pages/**/*"
  - "docs/specs/design/**/*"
---

# Skill Web - Gestion des pages

## Description

Skill generique pour travailler sur **n'importe quelle page web** du projet. Detecte automatiquement les fichiers associes (page, API frontend, router backend, documentation).

## Usage

```bash
/web <page>                    # Mode normal : travailler sur une page specifique
/web <page> --bug <desc>       # Mode debug : corriger un bug sur la page
/web <page> --new <desc>       # Mode ajout : ajouter une feature a la page
/web <page> --design           # Mode design : verifier la conformite au design system
/web <page> --validate         # Mode validate : verifier le frontmatter et l'implementation
/web                           # Sans argument : demande quelle page cibler
```

## Arguments

| Argument     | Alias | Description                                             |
| ------------ | ----- | ------------------------------------------------------- |
| `<page>`     |       | Nom de la page a cibler (ex: dashboard, tempo, admin)   |
| `--bug`      | `-b`  | Mode debug : analyse et corrige un bug signale          |
| `--new`      | `-n`  | Mode ajout : ajoute une nouvelle feature                |
| `--design`   | `-d`  | Mode design : verifie la conformite au design system    |
| `--validate` | `-v`  | Mode validate : verifie le frontmatter et l'integration |

## Pages disponibles

**Convention de nommage documentation** : `docs/specs/pages/<order>-<page>.md` (ex: `05-simulator.md`)

### Pages principales

| Page               | Fichier(s)                        | Documentation                         | Mode               |
| ------------------ | --------------------------------- | ------------------------------------- | ------------------ |
| `signup`           | `pages/Signup.tsx`                | `docs/specs/pages/00-signup.md`       | Serveur uniquement |
| `landing`          | `pages/Landing.tsx`               | `docs/specs/pages/01-root.md`         | Serveur uniquement |
| `dashboard`        | `pages/Dashboard.tsx`             | `docs/specs/pages/02-dashboard.md`    | Serveur + Client   |
| `consumption`      | `pages/Consumption/index.tsx`     | `docs/specs/pages/consumption/`       | Serveur + Client   |
| `consumption-kwh`  | `pages/ConsumptionKwh/index.tsx`  | `docs/specs/pages/consumption/`       | Serveur + Client   |
| `consumption-euro` | `pages/ConsumptionEuro/index.tsx` | `docs/specs/pages/consumption/`       | Serveur + Client   |
| `production`       | `pages/Production/index.tsx`      | `docs/specs/pages/03-production.md`   | Serveur + Client   |
| `balance`          | `pages/Balance/index.tsx`         | `docs/specs/pages/04-bilan.md`        | Serveur + Client   |
| `simulator`        | `pages/Simulator.tsx`             | `docs/specs/pages/05-simulator.md`    | Serveur uniquement |
| `contribute`       | `pages/Contribute/index.tsx`      | `docs/specs/pages/contributes/`       | Serveur uniquement |
| `tempo`            | `pages/Tempo.tsx`                 | `docs/specs/pages/07-tempo.md`        | Serveur + Client   |
| `ecowatt`          | `pages/EcoWatt.tsx`               | `docs/specs/pages/08-ecowatt.md`      | Serveur + Client   |
| `france`           | `pages/France.tsx`                | `docs/specs/pages/09-france.md`       | Serveur + Client   |
| `faq`              | `pages/FAQ.tsx`                   | `docs/specs/pages/20-faq.md`          | Serveur uniquement |
| `api-docs`         | `pages/ApiDocs.tsx`               | `docs/specs/pages/21-api-docs.md`     | Serveur uniquement |
| `settings`         | `pages/Settings.tsx`              | `docs/specs/pages/22-settings.md`     | Serveur uniquement |

### Pages Administration (Serveur uniquement)

| Page                  | Fichier                         | Documentation                    |
| --------------------- | ------------------------------- | -------------------------------- |
| `admin`               | `pages/Admin/Dashboard.tsx`     | `docs/specs/pages/admin/`        |
| `admin-users`         | `pages/Admin/Users.tsx`         | `docs/specs/pages/admin/`        |
| `admin-roles`         | `pages/Admin/Roles.tsx`         | `docs/specs/pages/admin/`        |
| `admin-offers`        | `pages/Admin/Offers.tsx`        | `docs/specs/pages/admin/`        |
| `admin-contributions` | `pages/Admin/Contributions.tsx` | `docs/specs/pages/admin/`        |
| `admin-tempo`         | `pages/Admin/Tempo.tsx`         | `docs/specs/pages/admin/`        |
| `admin-ecowatt`       | `pages/Admin/EcoWatt.tsx`       | `docs/specs/pages/admin/`        |
| `admin-logs`          | `pages/Admin/Logs.tsx`          | `docs/specs/pages/admin/`        |
| `admin-add-pdl`       | `pages/Admin/AddPDL.tsx`        | `docs/specs/pages/admin/`        |

### Pages Exporters (Client uniquement)

| Page               | Fichier                     | Documentation                                       |
| ------------------ | --------------------------- | --------------------------------------------------- |
| `home-assistant`   | `pages/HomeAssistant.tsx`   | `docs/local-client/integrations/home-assistant.md`  |
| `mqtt`             | `pages/MQTT.tsx`            | `docs/local-client/integrations/mqtt.md`            |
| `victoria-metrics` | `pages/VictoriaMetrics.tsx` | `docs/local-client/integrations/victoriametrics.md` |
| `exporter`         | `pages/Exporter/index.tsx`  | `docs/local-client/exporters.md`                    |

## Detection automatique des fichiers

Quand une page est selectionnee, le skill detecte automatiquement :

1. **Fichier page** : `apps/web/src/pages/<Page>.tsx` ou `apps/web/src/pages/<Page>/index.tsx`
2. **Composants** : `apps/web/src/pages/<Page>/components/**/*`
3. **API frontend** : `apps/web/src/api/<page>.ts`
4. **Router backend** : `apps/api/src/routers/<page>.py`
5. **Documentation** : Voir section "Structure de documentation" ci-dessous
6. **Commande existante** : `.claude/commands/web_<page>.md`

## Structure de documentation

La documentation des pages suit deux formats selon la complexite :

### Page simple (fichier `.md`)

```text
docs/specs/pages/<order>-<page>.md
```

**Caracteristiques** :

- Page sans onglets
- Un seul fichier de documentation
- Le prefixe `<order>-` est un nombre pour l'ordre dans le menu (ex: `05-`, `07-`)
- Exemple : `docs/specs/pages/02-dashboard.md`, `docs/specs/pages/07-tempo.md`

### Page avec onglets (dossier)

```text
docs/specs/pages/<page>/
  ├── <order1>-<onglet1>.md
  ├── <order2>-<onglet2>.md
  └── <order3>-<onglet3>.md
```

**Caracteristiques** :

- Page avec plusieurs onglets/sous-pages
- Un fichier `.md` par onglet, prefixe numerique pour l'ordre
- Chaque fichier a un frontmatter YAML (voir ci-dessous)
- Exemple : `docs/specs/pages/contributes/` avec `01-offers.md`, `02-new-offers.md`, `03-my-offers.md`

### Frontmatter YAML

Chaque fichier de documentation doit avoir un frontmatter YAML :

```yaml
---
name: 01-offers
path: /contribute/offers
description: Onglet des offres disponibles
mode_client: false
mode_server: true
menu: Contribuer
subMenu: Contribuer
tab: Toutes les offres
---
```

| Champ         | Obligatoire | Description                                                   |
| ------------- | ----------- | ------------------------------------------------------------- |
| `name`        | Oui         | Identifiant unique de l'onglet                                |
| `path`        | Oui         | Route de l'onglet (ex: `/contribute/offers`)                  |
| `description` | Oui         | Description courte de l'onglet                                |
| `mode_client` | Oui         | `true` si disponible en mode client                           |
| `mode_server` | Oui         | `true` si disponible en mode serveur                          |
| `menu`        | Oui         | Nom du menu parent dans la navigation                         |
| `subMenu`     | Non         | Nom du lien dans le sous-menu (si present, cree un sous-menu) |
| `tab`         | Non         | Label de l'onglet pour les pages avec onglets internes        |

### Tableau Features (OBLIGATOIRE)

**Chaque documentation de page DOIT inclure un tableau "Features"** juste apres le titre H1.

Ce tableau sert de **TODO list** pour suivre l'avancement de l'implementation.

```markdown
## Features

| Feature                     | Statut |
| --------------------------- | ------ |
| Fonctionnalite principale   | FAIT   |
| Feature en cours            | WIP    |
| Feature planifiee           | TODO   |
| Feature abandonnee          | SKIP   |
```

**Statuts disponibles** :

| Statut | Description                                      |
| ------ | ------------------------------------------------ |
| `FAIT` | Implementation terminee et fonctionnelle         |
| `WIP`  | Work In Progress - en cours de developpement     |
| `TODO` | A faire - planifie mais pas encore commence      |
| `SKIP` | Abandonne ou reporte indefiniment                |

**Regles** :

1. Placer le tableau **immediatement apres le titre H1** et la description courte
2. Lister **toutes les fonctionnalites** de la page
3. Mettre a jour le statut a chaque modification
4. Chaque feature FAIT doit avoir une section `### Feature (FAIT)` plus bas dans le document

**Exemple complet** :

```markdown
---
name: tempo
path: /tempo
description: Calendrier TEMPO EDF
mode_client: true
mode_server: true
menu: Tempo
---

# Tempo

Page affichant le calendrier TEMPO EDF.

## Features

| Feature            | Statut |
| ------------------ | ------ |
| Calendrier mensuel | FAIT   |
| Statistiques       | FAIT   |
| Export PDF         | TODO   |

## Details implementation

### Calendrier mensuel (FAIT)

Description de l'implementation...

### Statistiques (FAIT)

Description de l'implementation...
```

**Comportement du menu** :

- Si `subMenu` est absent → la page est un lien direct dans le menu principal
- Si `subMenu` est present → la page apparait comme sous-element du menu parent

**Comportement des onglets** :

- Si `tab` est present → la page fait partie d'un groupe d'onglets (navigation horizontale)
- Chaque fichier `.md` dans le dossier represente un onglet
- Les onglets sont tries par le prefixe numerique du fichier (`01-`, `02-`, etc.)

**Exemple de navigation** :

```text
Menu lateral
├── Dashboard
├── Consommation
├── Contribuer          ← menu (parent)
│   ├── Offres          ← subMenu: Offres
│   ├── Nouvelle        ← subMenu: Nouvelle
│   └── Mes contributions ← subMenu: Mes contributions
└── Tempo
```

### Detection automatique

Pour determiner le type de documentation :

1. Verifier si `docs/specs/pages/<page>/` existe (dossier)
2. Si oui → page avec onglets, lire tous les fichiers `.md` du dossier
3. Sinon → chercher un fichier avec pattern `docs/specs/pages/*-<page>.md` (ex: `05-simulator.md`)
4. Si trouve → page simple, lire le fichier unique
5. Sinon → documentation manquante (a creer)

**Commande Glob pour detection** :

```bash
# Dossier (pages avec onglets)
docs/specs/pages/<page>/

# Fichier simple (avec prefixe numerique)
docs/specs/pages/*-<page>.md
```

## Workflow

### Etape 1 : Identification de la page (OBLIGATOIRE)

**Si aucune page n'est specifiee dans la commande**, proceder en deux etapes :

#### Etape 1.1 : Choisir le type de page

Utiliser `AskUserQuestion` :

- "Pages principales"
- "Pages administration"
- "Pages exporters"

**ATTENDRE la reponse.**

#### Etape 1.2 : Choisir la page specifique

Utiliser `AskUserQuestion` avec les pages du tableau correspondant (section "Pages disponibles" ci-dessus) :

- **Pages principales** → Lire le tableau "Pages principales"
- **Pages administration** → Lire le tableau "Pages Administration"
- **Pages exporters** → Lire le tableau "Pages Exporters"

Proposer les valeurs de la colonne `Page` comme options.

**ATTENDRE la reponse avant de continuer.**

**NE PAS deviner la page. Toujours demander si non specifiee.**

### Etape 2 : Chargement du contexte

1. **Detecter le type de documentation** :
   - Si `docs/specs/pages/<page>/` existe → page avec onglets → lire tous les `.md` du dossier
   - Sinon chercher `docs/specs/pages/*-<page>.md` (avec prefixe numerique) → page simple
2. Lire la commande existante si elle existe (`.claude/commands/web_<page>.md`)
3. Identifier les fichiers de la page
4. Verifier le mode d'execution (Serveur/Client/Les deux)

### Etape 3 : Execution selon le mode

| Mode         | Action                                                            |
| ------------ | ----------------------------------------------------------------- |
| Normal       | Suivre les specifications de la documentation                     |
| `--bug`      | Analyser et corriger le bug decrit                                |
| `--new`      | Ajouter la feature dans la documentation et implementer           |
| `--design`   | Verifier la conformite avec `docs/specs/design/checklist.md`      |
| `--validate` | Executer steps 01 → 04 → 05 en mode verification (sans modifier)  |

#### Mode `--validate` : Workflow complet de verification

**Ce mode execute les etapes existantes en mode "lecture seule" pour valider la coherence.**

1. **Step 01 - Explore** : Executer normalement pour generer le rapport de conformite
   - Verifier frontmatter, routes, navigation, modes, features, APIs
   - **NE PAS passer au step 02** (pas de planification)

2. **Step 04 - Lint** : Executer les verifications lint
   - Frontend : `cd apps/web && npm run lint`
   - Backend : `cd apps/api && make lint` (si fichiers backend concernes)

3. **Step 05 - Validate** : Executer les verifications runtime
   - Logs Docker : `make logs`
   - Design : `/check_design` ou `docs/specs/design/checklist.md`
   - **NE PAS demander validation utilisateur** (mode automatique)

4. **Rapport final** : Afficher un resume global

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 VALIDATION COMPLETE - <page_name>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Exploration (01)  : [✅ OK / ⚠️ Warnings / ❌ Erreurs]
Lint (04)         : [✅ OK / ❌ Erreurs]
Validation (05)   : [✅ OK / ⚠️ Warnings / ❌ Erreurs]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESULTAT : [✅ VALIDE / ❌ ECHEC - <N> problemes]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**NE PAS executer les steps 02 (plan), 03 (execute), 06 (docs), 07 (commit).**

### Etape 4 : Lint

```bash
make lint
```

### Etape 5 : Validation utilisateur

Utiliser `AskUserQuestion` pour demander validation.

### Etape 6 : Documentation

Mettre a jour la documentation si necessaire :

- **Page simple** : modifier `docs/specs/pages/<order>-<page>.md` (ex: `05-simulator.md`)
- **Page avec onglets** : modifier le fichier `.md` correspondant a l'onglet dans `docs/specs/pages/<page>/`

### Etape 7 : Commit (si demande)

Respecter `.claude/rules/commits.md` (Semantic Release).

## Exemples

```bash
# Travailler sur le dashboard
/web dashboard

# Corriger un bug sur la page Tempo
/web tempo --bug "Le calendrier ne s'affiche pas correctement"

# Ajouter une feature sur la page EcoWatt
/web ecowatt --new "Ajouter export PDF du signal"

# Verifier le design de la page Admin Users
/web admin-users --design

# Valider le frontmatter et l'integration de la page Tempo
/web tempo --validate

# Sans argument : demande quelle page
/web
```

## References

- **Design system** : `docs/specs/design/`
- **Ordre du menu** : `docs/specs/pages/_menu.md`
- **Regles modes** : `.claude/rules/modes.md`
- **Regles commits** : `.claude/rules/commits.md`
- **Regles pages** : `.claude/rules/pages.md`
