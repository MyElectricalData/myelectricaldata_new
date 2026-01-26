---
name: 01-explore
description: Explorer le contexte de la page et analyser le code existant
next_step: steps/02-plan.md
---

# Step 1/7 : Explorer le contexte

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📂 STEP 1/7 - EXPLORATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Etape 1 : Charger la documentation

Lire la documentation de la page dans `docs/specs/pages/<page_name>.md` ou `docs/specs/pages/<page_name>/`.

### Detection du type de page

| Structure documentation         | Type de page      | Action                                          |
| ------------------------------- | ----------------- | ----------------------------------------------- |
| Un seul fichier `.md`           | Page simple       | Lire le fichier unique                          |
| Un dossier avec plusieurs `.md` | Page avec onglets | Lire tous les fichiers, chaque `.md` = 1 onglet |

**Exemple page simple :**

```text
docs/specs/pages/tempo.md        → Page Tempo (pas d'onglets)
```

**Exemple page avec onglets :**

```text
docs/specs/pages/consumption/
├── 00-index.md            → Description generale (toujours en premier)
├── 01-kwh.md              → Onglet 1 : kWh
├── 02-euro.md             → Onglet 2 : Euro
└── 03-stats.md            → Onglet 3 : Statistiques
```

**Convention de nommage :**

- Le prefixe `XX-` definit l'ordre d'affichage des onglets
- `00-index.md` contient la description generale de la page
- Les fichiers sont tries par ordre alphabetique (donc numerique)

### Frontmatter YAML

Chaque fichier `.md` contient un header YAML avec les metadonnees. Extraire les champs suivants :

- `path` : Route de la page
- `mode_client` / `mode_server` : Modes d'execution
- `menu` / `subMenu` : Navigation
- `tab` : Label d'onglet (si applicable)

**Reference complete** : Voir `SKILL.md` section "Frontmatter YAML" pour la specification des champs.

## Etape 2 : Identifier les fichiers source

A partir du nom de page, localiser :

| Type de fichier | Emplacement                                           |
| --------------- | ----------------------------------------------------- |
| Page principale | `apps/web/src/pages/<Page>.tsx` ou `<Page>/index.tsx` |
| Composants      | `apps/web/src/pages/<Page>/components/**/*`           |
| API frontend    | `apps/web/src/api/<page>.ts`                          |
| Router backend  | `apps/api/src/routers/<page>.py`                      |

## Etape 3 : Verifier le mode d'execution

Lire le frontmatter YAML de chaque fichier de documentation pour determiner le mode :

| `mode_server` | `mode_client` | Disponibilite      |
| ------------- | ------------- | ------------------ |
| `true`        | `true`        | Serveur + Client   |
| `true`        | `false`       | Serveur uniquement |
| `false`       | `true`        | Client uniquement  |

**NE PAS se fier au tableau SKILL.md, lire le frontmatter de la documentation.**

## Etape 4 : Lire la commande existante (si presente)

Verifier si une commande specifique existe : `.claude/commands/web_<page>.md`

Si elle existe, la lire pour obtenir des instructions supplementaires.

## Etape 5 : Analyser le code existant

**IMPORTANT : Comprendre le code actuel AVANT de planifier les modifications.**

### 5.1 Verification des routes (`path` → `App.tsx`)

1. Lire le frontmatter pour extraire le `path`
2. Chercher dans `apps/web/src/App.tsx` :
   - La route doit exister : `<Route path="<path>" ...`
   - Ou une redirection vers cette route

### 5.2 Verification de la navigation (`menu` / `subMenu` → `Layout.tsx`)

1. Lire `apps/web/src/components/Layout.tsx`
2. Identifier les tableaux de navigation :
   - `menuItems` : liens directs dans la sidebar
   - `consumptionSubItems`, `adminSubItems`, `contributeSubItems`, etc. : sous-menus

3. **Verifier la correspondance :**

| Frontmatter | Code Layout.tsx                                                       | Verification                                                  |
| ----------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `menu`      | Doit exister un lien avec `label: "<menu>"`                           | Rechercher dans `menuItems` ou dans les sections de sous-menu |
| `subMenu`   | Si present, doit exister dans `xxxSubItems` avec `label: "<subMenu>"` | Le label doit correspondre **exactement**                     |
| `path`      | Le `to:` du sous-item doit correspondre au path                       | `{ to: '<path>', label: '<subMenu>' }`                        |

### 5.3 Verification des modes (`mode_client` / `mode_server`)

1. Si `mode_server: true` uniquement :
   - Verifier que le lien/sous-menu est conditionne par `isServerMode`
2. Si `mode_client: true` uniquement :
   - Verifier que le lien/sous-menu est conditionne par `isClientMode`
3. Si les deux sont `true` :
   - Le lien doit etre visible dans les deux modes (pas de condition)

### 5.4 Verification des features documentees

Pour chaque feature documentee dans la documentation de la page :

1. **Rechercher dans le code** le composant/fonction correspondant
2. **Verifier la presence** du code qui implemente la feature
3. **Comparer les comportements** decrits vs implementes

### 5.5 Verification des appels API

Pour chaque endpoint documente :

1. Verifier que l'appel existe dans `apps/web/src/api/<page>.ts`
2. Verifier que le router backend existe dans `apps/api/src/routers/<page>.py`

## Etape 6 : Rapport d'analyse

**Afficher un rapport de conformite :**

```text
📋 Rapport d'exploration - <page_name>
────────────────────────────────────────

Documentation :
- Type : [Simple / Avec onglets]
- Mode serveur : [oui/non]
- Mode client : [oui/non]

Routes :
- path : <path> → [✅ OK / ❌ MANQUANT dans App.tsx]

Navigation :
- menu : <menu> → [✅ OK / ❌ MANQUANT dans Layout.tsx]
- subMenu : <subMenu> → [✅ OK / ⚠️ DIFFERENT / ❌ MANQUANT]

Modes :
- Condition isServerMode : [✅ OK / ❌ MANQUANT]
- Condition isClientMode : [✅ OK / ❌ MANQUANT / N/A]

Features (doc vs code) :
- <feature 1> : [✅ Implementee / ❌ Manquante]
- <feature 2> : [✅ Implementee / ⚠️ Partielle]

Features supplementaires (code sans doc) :
- <feature A> : Present dans le code mais non documente

APIs :
- <endpoint 1> : [✅ Frontend + Backend / ❌ Manquant]
────────────────────────────────────────
```

## Recap Step 1

**Afficher a la fin de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ STEP 1/7 - EXPLORATION TERMINEE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Page        : <page_name>
Type        : [Simple / Avec onglets]
Mode        : [Serveur / Client / Les deux]
Fichiers    : <nombre> fichiers identifies
Features    : <X> implementees, <Y> a faire
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Passage au Step 2 : Planification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
