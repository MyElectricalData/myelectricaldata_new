# Tableau de bord

**Route:** `/dashboard`

## Description de la page

Cette page est le **tableau de bord principal** où les utilisateurs peuvent gérer leurs Points De Livraison (PDL) et accéder à leurs données Enedis.

## Fonctionnalités principales

1. **Gestion des PDL**

   - Liste de tous les PDL de l'utilisateur
   - Affichage des PDL actifs et inactifs
   - Filtrage : afficher/masquer les PDL inactifs
   - Tri par ordre personnalisé (drag & drop)
   - Informations affichées par PDL :
     - Nom personnalisé ou numéro de PDL
     - Puissance souscrite
     - Heures creuses configurées
     - Statut (actif/inactif)

2. **Actions sur les PDL**

   - Éditer le nom, la puissance souscrite et les heures creuses
   - Activer/Désactiver un PDL (voir section détaillée ci-dessous)
   - Supprimer un PDL (avec confirmation)
   - Réorganiser l'ordre d'affichage (drag & drop)

3. **Consentement Enedis**

   - Bouton "Démarrer le consentement Enedis"
   - Redirection vers le portail OAuth Enedis
   - Gestion du callback après autorisation
   - Ajout automatique du PDL après consentement réussi

4. **Notifications**

   - Messages de succès/erreur pour les actions
   - Affichage automatique après redirection OAuth
   - Disparition automatique après 10 secondes

5. **Statistiques**
   - Nombre de PDL actifs
   - Nombre de PDL inactifs
   - Nombre total de PDL

## Composants utilisés

- **PDLCard** : Carte affichant les informations d'un PDL
- **PDLEditModal** : Modal pour éditer un PDL
- **DeleteConfirmModal** : Modal de confirmation de suppression

## Technologies utilisées

- React avec TypeScript
- React Query pour les mutations et le cache
- React Beautiful DnD pour le drag & drop
- Tailwind CSS pour le style
- Support du mode sombre

## Fichiers liés

- **Frontend** : `apps/web/src/pages/Dashboard.tsx`
- **Composants** : `apps/web/src/components/PDLCard.tsx`, `apps/web/src/components/PDLEditModal.tsx`
- **API** : `apps/web/src/api/pdl.ts`, `apps/web/src/api/oauth.ts`
- **Types** : `apps/web/src/types/api.ts`
- **Backend** : `apps/api/src/routers/pdl.py`, `apps/api/src/routers/oauth.py`

## Notes importantes

- Les PDL peuvent être activés/désactivés sans être supprimés
- L'ordre d'affichage est persistant et synchronisé avec le backend
- Le consentement Enedis est requis pour ajouter un nouveau PDL
- Les heures creuses peuvent être au format tableau ou objet (legacy)
- Le champ `is_active` est optionnel (par défaut considéré comme `true`)

---

## 🔄 Fonctionnalité : Activation/Désactivation des PDL

### Description

Cette fonctionnalité permet aux utilisateurs de **désactiver temporairement leurs PDL** dans le dashboard sans les supprimer de la base de données.

### Interface utilisateur

#### 1. Bouton d'activation/désactivation

Dans chaque carte PDL :
- **PDL actif** : Icône œil ouvert (Eye) → Bouton "Désactiver" (orange)
- **PDL inactif** : Icône œil barré (EyeOff) → Bouton "Activer" (vert)

#### 2. Indicateur visuel pour les PDL désactivés

- Badge "Désactivé" affiché sur le nom du PDL
- Opacité réduite (60%) et fond grisé
- Transition fluide lors du changement d'état

#### 3. Filtre dans le dashboard

- Checkbox "Afficher les PDL désactivés"
- Compteur : "X actif(s) • Y désactivé(s)"
- Filtre appliqué en temps réel

### API Backend

**Endpoint :**

```http
PATCH /api/pdl/{pdl_id}/active
Content-Type: application/json

{
  "is_active": true/false
}
```

**Modèle :**
- Champ `is_active` (boolean) ajouté au modèle PDL
- Valeur par défaut : `true`
- Inclus dans toutes les réponses `PDLResponse`

### Fichiers impactés

**Backend :**
- [apps/api/src/models/pdl.py](../../apps/api/src/models/pdl.py) : Champ `is_active`
- [apps/api/src/routers/pdl.py](../../apps/api/src/routers/pdl.py) : Endpoint `toggle_pdl_active`
- [apps/api/src/schemas/responses.py](../../apps/api/src/schemas/responses.py) : `PDLResponse` avec `is_active`

**Frontend :**
- [apps/web/src/types/api.ts](../../apps/web/src/types/api.ts) : Interface PDL avec `is_active?: boolean`
- [apps/web/src/api/pdl.ts](../../apps/web/src/api/pdl.ts) : Méthode `toggleActive`
- [apps/web/src/components/PDLCard.tsx](../../apps/web/src/components/PDLCard.tsx) : Bouton + badge + styles
- [apps/web/src/pages/Dashboard.tsx](../../apps/web/src/pages/Dashboard.tsx) : Filtre + compteur

### Migration

**Script de migration :**

```bash
# Depuis la racine du projet
docker compose exec backend python /app/migrations/add_is_active_to_pdls.py
```

**Ou SQL direct :**

```bash
docker compose exec postgres psql -U myelectricaldata -d myelectricaldata -c \
  "ALTER TABLE pdls ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;"
```

### Utilisation

**Pour l'utilisateur :**

1. **Désactiver un PDL** :
   - Aller dans le Dashboard
   - Cliquer sur "Désactiver" (icône œil) sur le PDL
   - Le PDL devient grisé avec badge "Désactivé"

2. **Réactiver un PDL** :
   - Cliquer sur "Activer" (icône œil barré)
   - Le PDL redevient normal

3. **Filtrer les PDL** :
   - Décocher "Afficher les PDL désactivés" pour les masquer
   - Cocher pour les réafficher

**Pour le développeur (API) :**

```bash
# Vérifier l'état d'un PDL
curl -H "Authorization: Bearer <token>" \
  http://localhost:8081/api/pdl

# Désactiver un PDL
curl -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}' \
  http://localhost:8081/api/pdl/{pdl_id}/active
```

### Avantages

1. **Pas de perte de données** : Les PDL désactivés restent en base
2. **Flexibilité** : Possibilité de réactiver à tout moment
3. **Organisation** : Masquage des PDL non utilisés sans suppression
4. **Traçabilité** : Historique des PDL conservé

### Design

- Couleurs cohérentes avec le design system
- Icônes intuitives (Eye/EyeOff de lucide-react)
- Animations fluides (transitions CSS)
- Responsive (mobile et desktop)

### Notes techniques

- Le champ `is_active` est obligatoire (NOT NULL) avec valeur par défaut `true`
- Les PDL désactivés restent visibles dans l'interface admin
- L'ordre personnalisé (drag & drop) fonctionne avec les PDL désactivés
- Tous les PDL existants ont automatiquement `is_active = true` après migration

---

## 🔗 Fonctionnalité : Liaison PDL Consommation - Production

### Description

Cette fonctionnalité permet aux utilisateurs de **lier un PDL de production à un PDL de consommation** pour créer des visualisations combinées des données de consommation et de production.

**Cas d'usage :** Un utilisateur possède un PDL de consommation (compteur principal) et un PDL de production (panneaux solaires). En les liant, il pourra visualiser des graphiques combinés montrant la consommation vs la production, l'autoconsommation, le surplus injecté, etc.

### Interface utilisateur

#### 1. Sélecteur de liaison dans PDLCard

Pour chaque **PDL de consommation** (`has_consumption = true`) :
- Section "PDL de production lié" affichée en bas de la carte
- Dropdown de sélection avec :
  - Option "Aucun" pour délier
  - Liste des PDL de production disponibles (`has_production = true`)
- Message informatif quand un PDL est lié
- Sauvegarde automatique lors de la sélection

#### 2. Conditions d'affichage

Le sélecteur de liaison est affiché **uniquement si** :
- Le PDL a la consommation activée (`has_consumption = true`)
- Le PDL n'a **pas** la production activée (`has_production = false`)
  - _Raison : Un PDL qui produit déjà de l'énergie n'a pas besoin d'être lié à un autre PDL de production_
- Au moins un PDL de production existe dans le compte utilisateur
- Pas d'erreur de consentement Enedis

### API Backend

**Endpoint :**

```http
PATCH /api/pdl/{pdl_id}/link-production
Content-Type: application/json

{
  "linked_production_pdl_id": "uuid-du-pdl-production" | null
}
```

**Validations :**
- Le PDL source doit avoir `has_consumption = true`
- Le PDL cible doit avoir `has_production = true`
- Les deux PDL doivent appartenir au même utilisateur
- Un PDL ne peut pas être lié à lui-même
- `null` pour délier

**Réponse :**

```json
{
  "success": true,
  "data": {
    "id": "uuid-pdl-consommation",
    "usage_point_id": "12345678901234",
    "linked_production_pdl_id": "uuid-pdl-production",
    "linked_production_pdl_name": "Panneaux solaires",
    "message": "Production PDL linked successfully"
  }
}
```

**Modèle :**
- Champ `linked_production_pdl_id` (string, nullable) ajouté au modèle PDL
- Foreign key vers `pdls.id` avec `ON DELETE SET NULL`
- Relation unidirectionnelle : consommation → production

### Fichiers impactés

**Backend :**
- [apps/api/src/models/pdl.py](../../apps/api/src/models/pdl.py) : Champ `linked_production_pdl_id`
- [apps/api/src/routers/pdl.py](../../apps/api/src/routers/pdl.py) : Endpoint `link_production_pdl` + validations
- [apps/api/src/schemas/responses.py](../../apps/api/src/schemas/responses.py) : `PDLResponse` avec `linked_production_pdl_id`

**Frontend :**
- [apps/web/src/types/api.ts](../../apps/web/src/types/api.ts) : Interface PDL avec `linked_production_pdl_id?: string`
- [apps/web/src/api/pdl.ts](../../apps/web/src/api/pdl.ts) : Méthode `linkProduction`
- [apps/web/src/components/PDLCard.tsx](../../apps/web/src/components/PDLCard.tsx) : Dropdown + mutation
- [apps/web/src/pages/Dashboard.tsx](../../apps/web/src/pages/Dashboard.tsx) : Passage de `allPdls` prop

### Migration

**Script de migration :**

```bash
# Depuis la racine du projet
docker compose exec backend python /app/migrations/add_linked_production_pdl_id.py
```

**Redémarrage :**

```bash
docker compose restart backend frontend
```

### Utilisation

**Pour l'utilisateur :**

1. **Lier un PDL de production** :
   - Aller dans le Dashboard
   - Ouvrir la carte d'un PDL de consommation
   - Dans la section "PDL de production lié", sélectionner un PDL de production
   - La liaison est sauvegardée automatiquement
   - Un message confirme le lien

2. **Délier un PDL** :
   - Sélectionner "Aucun" dans le dropdown
   - La liaison est supprimée instantanément

**Pour le développeur (API) :**

```bash
# Lier un PDL de production
curl -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"linked_production_pdl_id": "uuid-pdl-production"}' \
  http://localhost:8081/api/pdl/{pdl-consommation-id}/link-production

# Délier
curl -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"linked_production_pdl_id": null}' \
  http://localhost:8081/api/pdl/{pdl-consommation-id}/link-production
```

### Exemples d'erreurs

**PDL de consommation invalide :**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PDL_TYPE",
    "message": "This PDL does not have consumption data. Only consumption PDLs can be linked to production PDLs."
  }
}
```

**PDL de production invalide :**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PDL_TYPE",
    "message": "The target PDL does not have production data. Please select a PDL with production capability."
  }
}
```

**Auto-liaison :**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_LINK",
    "message": "Cannot link a PDL to itself"
  }
}
```

### Avantages

1. **Base pour graphiques combinés** : Permet de créer des visualisations consommation + production
2. **Calcul d'autoconsommation** : Mesure de l'énergie produite et consommée directement
3. **Optimisation énergétique** : Analyse du surplus de production et du bilan net
4. **Simulateur enrichi** : Prise en compte de la production dans les simulations d'offres

### Développements futurs

Cette fonctionnalité pose les bases pour :

- **Graphiques combinés** : Visualisation consommation + production sur même timeline
- **Analyses avancées** :
  - Taux d'autoconsommation
  - Taux d'autoproduction
  - Bilan énergétique net
- **Simulateur enrichi** : Optimisation des contrats avec production
- **Stockage d'énergie** : Calculs d'optimisation de batterie

### Design

- Intégration harmonieuse dans PDLCard
- Icône Factory (usine) pour représenter la production
- Dropdown avec styles cohérents au design system
- Message informatif en texte grisé
- Responsive (mobile et desktop)

### Notes techniques

- Le champ `linked_production_pdl_id` est nullable (optionnel)
- Foreign key avec `ON DELETE SET NULL` : la suppression d'un PDL de production déliera automatiquement tous les PDL de consommation liés
- Relation unidirectionnelle : consommation → production
- Un PDL de consommation ne peut être lié qu'à un seul PDL de production
- Un PDL de production peut être lié à plusieurs PDL de consommation
- Compatible SQLite et PostgreSQL
- Aucune donnée n'est copiée, seul le lien (UUID) est stocké

---

## 💰 Fonctionnalité : Sélection de l'offre tarifaire

### Description

Cette fonctionnalité permet aux utilisateurs de **sélectionner leur offre tarifaire actuelle** pour chaque PDL. L'offre sélectionnée est utilisée dans le simulateur pour comparer avec d'autres offres disponibles.

### Interface utilisateur

#### 1. Sélecteur d'offre dans PDLCard

Le composant `OfferSelector` affiche 3 sélecteurs sur une seule ligne :

| Sélecteur | Description |
|-----------|-------------|
| **Fournisseur** | Liste des fournisseurs d'énergie (EDF, Enercoop, TotalEnergies, etc.) |
| **Type** | Type d'offre (Base, Heures Creuses, Tempo, EJP, Weekend, Saisonnier) |
| **Offre** | Nom de l'offre spécifique |

#### 2. Affichage des prix détaillés

Une fois l'offre sélectionnée, un bloc récapitulatif s'affiche avec :

- **En-tête** : Fournisseur - Nom de l'offre + badge du type
- **Abonnement** : Prix mensuel en €/mois
- **Puissance** : Si spécifiée dans l'offre (kVA)
- **Prix détaillés** : Tous les prix selon le type d'offre (en €/kWh)
- **Date de mise à jour** : Dernière actualisation des tarifs

#### 3. Types d'offres et prix affichés

| Type | Prix affichés |
|------|---------------|
| **BASE** | Prix kWh unique |
| **HC_HP** | Heures Pleines, Heures Creuses |
| **TEMPO** | Bleu HP/HC, Blanc HP/HC, Rouge HP/HC (6 prix) |
| **EJP** | Jours normaux, Jours de pointe |
| **WEEKEND** | Semaine HP/HC, Week-end HP/HC |
| **SEASONAL** | Hiver HP/HC, Été HP/HC, Jours de pointe |

#### 4. Codes couleur des prix

- 🔵 **Bleu** : Jours Tempo Bleus
- ⚪ **Gris** : Jours Tempo Blancs
- 🔴 **Rouge** : Jours Tempo Rouges / Jours de pointe
- 🟣 **Violet** : Week-end
- 🔷 **Cyan** : Hiver (offres saisonnières)
- 🟠 **Ambre** : Été (offres saisonnières)

### API Backend

**Endpoint :**

```http
PATCH /api/pdl/{pdl_id}/offer
Content-Type: application/json

{
  "selected_offer_id": "uuid-de-l-offre" | null
}
```

### Fichiers impactés

**Frontend :**
- [apps/web/src/components/OfferSelector.tsx](../../apps/web/src/components/OfferSelector.tsx) : Composant de sélection
- [apps/web/src/components/PDLCard.tsx](../../apps/web/src/components/PDLCard.tsx) : Intégration du sélecteur
- [apps/web/src/api/energy.ts](../../apps/web/src/api/energy.ts) : Types EnergyOffer, EnergyProvider
- [apps/web/src/api/pdl.ts](../../apps/web/src/api/pdl.ts) : Méthode `updateSelectedOffer`

**Backend :**
- [apps/api/src/models/pdl.py](../../apps/api/src/models/pdl.py) : Champ `selected_offer_id`
- [apps/api/src/routers/pdl.py](../../apps/api/src/routers/pdl.py) : Endpoint de mise à jour

### Utilisation

**Pour l'utilisateur :**

1. Dans la carte PDL, section "Offre tarifaire"
2. Sélectionner le fournisseur
3. Sélectionner le type d'offre
4. Sélectionner l'offre spécifique
5. Le récapitulatif des prix s'affiche automatiquement
6. Cliquer sur ✕ pour effacer la sélection

### Design

- 3 sélecteurs alignés sur une ligne (`grid-cols-3`)
- Labels compacts avec icônes (Building2, Zap, Tag)
- Bloc récapitulatif en fond bleu clair
- Prix en €/kWh avec 4 décimales
- Abonnement en €/mois avec 2 décimales
- Support du mode sombre
- Responsive (s'adapte aux petits écrans)

### Notes techniques

- Les offres sont filtrées par puissance souscrite du PDL
- Seules les offres actives (`is_active = true`) sont affichées
- Les sélecteurs sont en cascade : Type dépend du Fournisseur, Offre dépend du Type
- La sélection est persistée immédiatement via mutation React Query
- Le cache des offres est conservé 5 minutes (`staleTime`)
