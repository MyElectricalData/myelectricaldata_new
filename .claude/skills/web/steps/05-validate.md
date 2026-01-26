---
name: 05-validate
description: Valider que le code est pret a etre commit
prev_step: steps/04-lint.md
next_step: steps/06-docs.md
---

# Step 5/7 : Valider

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔️ STEP 5/7 - VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Cette etape verifie que le code est pret a etre commit.**

## Verification des logs Docker

Verifier les logs pour detecter les erreurs runtime :

```bash
make logs
```

**Erreurs a rechercher :**

| Type     | Erreurs a detecter                                   |
| -------- | ---------------------------------------------------- |
| Backend  | `ERROR`, `CRITICAL`, codes HTTP 500, exceptions      |
| Frontend | Erreurs TypeScript, compilation Vite, warnings React |

## Verification utilisateur (OBLIGATOIRE)

**IMPORTANT : NE PAS passer a l'etape suivante sans validation utilisateur.**

Utiliser `AskUserQuestion` pour demander a l'utilisateur de verifier :

```text
Question : "La page <path> fonctionne-t-elle correctement ?"

Options :
- "Oui, tout fonctionne" → Passer a l'etape suivante
- "Non, il y a des problemes" → Demander les details et corriger
```

**Points a verifier par l'utilisateur :**

- La page s'affiche correctement
- Les fonctionnalites implementees fonctionnent
- Le mode dark/light est correct
- L'affichage est responsive

**ATTENDRE la reponse avant de continuer.**

## Verification design (si modifications UI)

Si des modifications UI ont ete faites :

```bash
/check_design
```

Ou verifier manuellement avec : `docs/specs/design/checklist.md`

## Recap Step 5

**Afficher a la fin de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ STEP 5/7 - VALIDATION TERMINEE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Logs Docker   : [✅ OK / ❌ Erreurs]
Utilisateur   : [✅ Valide / ❌ Corrections demandees]
Design        : [✅ Conforme / ⚠️ A verifier / N/A]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Passage au Step 6 : Documentation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
