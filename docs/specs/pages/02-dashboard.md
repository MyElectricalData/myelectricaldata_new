---
name: dashboard
id: dashboard
path: /dashboard
description: Tableau de bord principal pour gérer les Points De Livraison (PDL)
mode_client: true
mode_server: true
menu: Tableau de bord
---

# Tableau de bord

Tableau de bord principal pour gérer les Points De Livraison (PDL) et accéder aux données Enedis.

## Features

| Feature                              | Statut | Mode           |
| ------------------------------------ | ------ | -------------- |
| Liste des PDL actifs/inactifs        | FAIT   | Serveur+Client |
| Consentement Enedis                  | FAIT   | Serveur        |
| Synchronisation gateway              | FAIT   | Client         |
| Drag & drop pour réorganiser les PDL | FAIT   | Serveur+Client |
| Recherche PDL par nom ou numéro      | FAIT   | Serveur+Client |
| Tri personnalisé/date/nom/numéro     | FAIT   | Serveur+Client |
| Activation/désactivation des PDL     | FAIT   | Serveur+Client |
| Liaison PDL consommation-production  | FAIT   | Serveur+Client |
| Sélection offre tarifaire par PDL    | FAIT   | Serveur+Client |
| Configuration heures creuses         | FAIT   | Serveur+Client |
| Mode démo avec données fictives      | FAIT   | Serveur        |
| Onboarding tour guidé                | FAIT   | Serveur        |
| Raccourcis clavier                   | FAIT   | Serveur+Client |
| Notifications toast                  | FAIT   | Serveur+Client |

## Raccourcis clavier

| Touche           | Action                  |
| ---------------- | ----------------------- |
| `C`              | Consentement Enedis     |
| `Shift+?`        | Afficher les raccourcis |
| `Ctrl+K`/`Cmd+K` | Rechercher un PDL       |
| `Escape`         | Fermer les modals       |

## Fichiers

| Type       | Fichier                                     |
| ---------- | ------------------------------------------- |
| Page       | `apps/web/src/pages/Dashboard.tsx`          |
| Composants | `apps/web/src/components/PDLCard.tsx`       |
|            | `apps/web/src/components/OfferSelector.tsx` |
|            | `apps/web/src/components/PDLDetails.tsx`    |
| API        | `apps/web/src/api/pdl.ts`                   |
|            | `apps/web/src/api/oauth.ts`                 |
| Backend    | `apps/api/src/routers/pdl.py`               |
|            | `apps/api/src/routers/oauth.py`             |

---

## API Endpoints

### Activation/Désactivation PDL

```http
PATCH /api/pdl/{pdl_id}/active
Content-Type: application/json

{ "is_active": true }
```

### Liaison PDL Production

```http
PATCH /api/pdl/{pdl_id}/link-production
Content-Type: application/json

{ "linked_production_pdl_id": "uuid" | null }
```

**Validations :**

- PDL source : `has_consumption = true`
- PDL cible : `has_production = true`
- Même utilisateur
- Pas d'auto-liaison

### Sélection Offre Tarifaire

```http
PATCH /api/pdl/{pdl_id}/offer
Content-Type: application/json

{ "selected_offer_id": "uuid" | null }
```

### Réorganisation PDL

```http
PATCH /api/pdl/reorder
Content-Type: application/json

{ "orders": [{ "id": "uuid", "order": 0 }, ...] }
```

---

## Interface utilisateur

### Carte PDL (PDLCard)

Chaque PDL affiche :

- Nom personnalisé ou numéro PDL
- Puissance souscrite (kVA)
- Heures creuses configurées
- Statut actif/inactif
- Offre tarifaire sélectionnée

**Actions disponibles :**

| Action    | Icône   | Description                   |
| --------- | ------- | ----------------------------- |
| Détails   | Info    | Voir contrat et adresse       |
| Sync      | Refresh | Synchroniser avec Enedis      |
| Activer   | Eye     | Activer/désactiver le PDL     |
| Supprimer | Trash   | Supprimer (avec confirmation) |

### Sélecteur d'offre tarifaire

3 sélecteurs en cascade :

1. **Fournisseur** : EDF, Enercoop, TotalEnergies...
2. **Type** : Base, HC/HP, Tempo, EJP, Weekend, Saisonnier
3. **Offre** : Nom spécifique

**Types d'offres et prix :**

| Type     | Prix affichés                        |
| -------- | ------------------------------------ |
| BASE     | Prix kWh unique                      |
| HC_HP    | Heures Pleines, Heures Creuses       |
| TEMPO    | Bleu HP/HC, Blanc HP/HC, Rouge HP/HC |
| EJP      | Jours normaux, Jours de pointe       |
| WEEKEND  | Semaine HP/HC, Week-end HP/HC        |
| SEASONAL | Hiver HP/HC, Été HP/HC, Pointe       |

### Liaison Consommation-Production

Permet de lier un PDL de production (panneaux solaires) à un PDL de consommation pour :

- Graphiques combinés consommation/production
- Calcul d'autoconsommation
- Bilan énergétique net

**Conditions d'affichage du sélecteur :**

- PDL avec `has_consumption = true`
- PDL sans production (`has_production = false`)
- Au moins un PDL de production existe

---

## Modes d'exécution

### Mode Serveur

- Bouton consentement Enedis (logo bleu)
- Onboarding tour guidé pour nouveaux utilisateurs
- Mode démo avec données fictives
- Bouton admin "Ajouter PDL"

### Mode Client

- Bouton "Synchroniser" pour récupérer les PDL depuis la gateway
- Sync automatique des offres d'énergie au chargement
- Refresh périodique des offres (24h)
- Pas d'onboarding ni de bouton d'aide

---

## Notes techniques

- Champ `is_active` : boolean, défaut `true`, NOT NULL
- Champ `linked_production_pdl_id` : nullable, FK avec `ON DELETE SET NULL`
- Drag & drop : mise à jour optimiste avec retour haptique
- Cache PDL : `staleTime` 30s, pas de persistence IndexedDB
- Cache offres : `staleTime` 5min
