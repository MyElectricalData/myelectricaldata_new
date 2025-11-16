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
