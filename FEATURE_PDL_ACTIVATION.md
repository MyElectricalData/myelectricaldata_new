# Fonctionnalité : Activation/Désactivation des PDL

## 📋 Description

Cette fonctionnalité permet aux utilisateurs de désactiver temporairement leurs points de livraison (PDL) dans le dashboard sans les supprimer de la base de données.

## ✨ Fonctionnalités

### Interface utilisateur

1. **Bouton d'activation/désactivation** dans chaque carte PDL
   - Icône œil ouvert (Eye) pour un PDL actif → Bouton "Désactiver"
   - Icône œil barré (EyeOff) pour un PDL inactif → Bouton "Activer"
   - Couleurs : orange pour désactiver, vert pour activer

2. **Indicateur visuel** pour les PDL désactivés
   - Badge "Désactivé" affiché sur le nom du PDL
   - Opacité réduite (60%) et fond grisé
   - Transition fluide lors du changement d'état

3. **Filtre dans le dashboard**
   - Checkbox "Afficher les PDL désactivés"
   - Compteur : "X actif(s) • Y désactivé(s)"
   - Filtre appliqué en temps réel

### Backend (API)

**Nouveau endpoint :**
```
PATCH /api/pdl/{pdl_id}/active
Body: { "is_active": true/false }
```

**Modifications de modèle :**
- Ajout du champ `is_active` (boolean) au modèle PDL
- Valeur par défaut : `true`
- Inclus dans toutes les réponses PDLResponse

## 🗂️ Fichiers modifiés

### Backend
- `apps/api/src/models/pdl.py` : Ajout du champ `is_active`
- `apps/api/src/routers/pdl.py` :
  - Nouveau endpoint `toggle_pdl_active`
  - Nouveau schéma `PDLUpdateActive`
  - Mise à jour de `list_pdls` pour inclure `is_active`
- `apps/api/src/schemas/responses.py` : Ajout de `is_active` à `PDLResponse`

### Frontend
- `apps/web/src/types/api.ts` : Ajout de `is_active?: boolean` à l'interface PDL
- `apps/web/src/api/pdl.ts` : Ajout de la méthode `toggleActive`
- `apps/web/src/components/PDLCard.tsx` :
  - Bouton d'activation/désactivation
  - Badge "Désactivé"
  - Style visuel pour PDL inactifs
  - Mutation `toggleActiveMutation`
- `apps/web/src/pages/Dashboard.tsx` :
  - Filtre "Afficher les PDL désactivés"
  - Compteur actifs/inactifs
  - Logique de filtrage dans `sortedPdls`

### Migration
- `apps/api/migrations/add_is_active_to_pdls.py` : Script de migration pour PostgreSQL

**Comment exécuter la migration :**
```bash
# Depuis le répertoire racine du projet
docker compose exec backend python /app/migrations/add_is_active_to_pdls.py
```

**Ou via SQL direct :**
```bash
docker compose exec postgres psql -U myelectricaldata -d myelectricaldata -c \
  "ALTER TABLE pdls ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;"
```

**Note :** La migration a déjà été appliquée sur l'environnement actuel.

## 🚀 Utilisation

### Pour l'utilisateur

1. **Désactiver un PDL** :
   - Aller dans le Dashboard
   - Cliquer sur le bouton "Désactiver" (icône œil) sur le PDL souhaité
   - Le PDL devient grisé avec le badge "Désactivé"

2. **Réactiver un PDL** :
   - Cliquer sur le bouton "Activer" (icône œil barré)
   - Le PDL redevient normal

3. **Filtrer les PDL** :
   - Décocher "Afficher les PDL désactivés" pour masquer les PDL inactifs
   - Cocher pour les réafficher

### Pour le développeur

**Vérifier l'état d'un PDL via l'API :**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/pdl
```

**Désactiver un PDL via l'API :**
```bash
curl -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}' \
  http://localhost:8000/api/pdl/{pdl_id}/active
```

## 🔄 Migration de données

Tous les PDL existants ont automatiquement `is_active = true` grâce à la valeur par défaut définie lors de la migration.

## 📊 Avantages

1. **Pas de perte de données** : Les PDL désactivés restent en base
2. **Flexibilité** : Possibilité de réactiver à tout moment
3. **Organisation** : Masquage des PDL non utilisés sans suppression
4. **Traçabilité** : Historique des PDL conservé

## 🎨 Design

- **Couleurs cohérentes** avec le design system existant
- **Icônes intuitives** (Eye/EyeOff de lucide-react)
- **Animations fluides** (transitions CSS)
- **Responsive** : fonctionne sur mobile et desktop

## ✅ Tests effectués

- ✅ Compilation backend (Python) sans erreur
- ✅ Ajout de la colonne PostgreSQL
- ✅ Redémarrage des conteneurs Docker
- ✅ Vérification des logs backend (aucune erreur)
- ✅ Structure de la table PostgreSQL vérifiée

## 📝 Notes

- Le champ `is_active` est obligatoire (NOT NULL) avec une valeur par défaut à `true`
- Les PDL désactivés restent visibles dans l'interface admin
- L'ordre personnalisé (drag & drop) fonctionne toujours avec les PDL désactivés
