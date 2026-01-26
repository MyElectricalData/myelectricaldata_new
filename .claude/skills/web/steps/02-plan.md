---
name: 02-plan
description: Lire les fonctionnalites a implementer
prev_step: steps/01-explore.md
next_step: steps/03-execute.md
---

# Step 2/7 : Planifier

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 STEP 2/7 - PLANIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Source des specifications

Les specifications sont dans la documentation de la page :

- **Page simple** : `docs/specs/pages/<page>.md`
- **Page avec onglets** : `docs/specs/pages/<page>/XX-<onglet>.md`

## Structure de la documentation

### Page simple

Le fichier contient :

- Frontmatter YAML (voir ci-dessous)
- Description de la page
- Features avec leur statut (FAIT / A FAIRE)
- Details d'implementation

### Page avec onglets

Chaque fichier `XX-<onglet>.md` contient :

- Frontmatter YAML (voir ci-dessous)
- Description de l'onglet
- Features specifiques a cet onglet avec leur statut
- Details d'implementation

**Ordre de lecture** : Trier les fichiers par prefixe numerique (00, 01, 02, etc.)

### Frontmatter YAML (OBLIGATOIRE)

**IMPORTANT : Le frontmatter definit les contraintes de la page. Toujours le lire en premier.**

| Champ         | Description                            | Impact sur l'implementation        |
| ------------- | -------------------------------------- | ---------------------------------- |
| `name`        | Identifiant de la page/onglet          | Nom des composants et fichiers     |
| `path`        | Route URL (ex: `/contribute/mine`)     | Configuration du router React      |
| `description` | Description courte                     | Documentation et commentaires      |
| `mode_client` | `true` si disponible en mode client    | Conditionner le code si necessaire |
| `mode_server` | `true` si disponible en mode serveur   | Conditionner le code si necessaire |
| `menu`        | Nom affiche dans le menu de navigation | Mise a jour du menu si nouveau     |

**Regles selon le mode :**

| `mode_server` | `mode_client` | Implementation                                 |
| ------------- | ------------- | ---------------------------------------------- |
| `true`        | `true`        | Code commun, pas de condition                  |
| `true`        | `false`       | Ajouter `{!isClientMode && ...}` si necessaire |
| `false`       | `true`        | Ajouter `{isClientMode && ...}` si necessaire  |

## Instructions

1. **Lire le frontmatter** de chaque fichier pour connaitre le mode d'execution
2. **Identifier les features** avec statut "A FAIRE"
3. **Comprendre les specifications** de chaque fonctionnalite
4. **Planifier l'ordre d'implementation** en respectant :
   - Les dependances entre features
   - Le mode d'execution cible (client/serveur)
   - L'ordre des onglets (si applicable)

## Modes d'execution du skill

| Mode       | Action                                                        |
| ---------- | ------------------------------------------------------------- |
| Normal     | Implementer les features "A FAIRE" dans l'ordre               |
| `--bug`    | Ignorer les features, analyser et corriger le bug decrit      |
| `--new`    | Ajouter la feature dans la documentation puis implementer     |
| `--design` | Ignorer les features, verifier la conformite au design system |

## Recap Step 2 + Validation OBLIGATOIRE

**Afficher le plan et ATTENDRE la validation utilisateur :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 STEP 2/7 - PLAN D'IMPLEMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Features a implementer :
1. <feature 1> [Mode: Serveur/Client/Les deux]
2. <feature 2> [Mode: Serveur/Client/Les deux]
...

Fichiers concernes :
- apps/web/src/pages/<Page>.tsx
- apps/web/src/api/<page>.ts
- apps/api/src/routers/<page>.py

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**VALIDATION OBLIGATOIRE** : Utiliser `AskUserQuestion` :

```text
Question : "Ce plan vous convient-il ?"

Options :
- "Oui, lancer l'implementation" → Passer au Step 3
- "Non, modifier le plan" → Demander les modifications souhaitees
```

**NE PAS passer au Step 3 sans validation explicite de l'utilisateur.**
