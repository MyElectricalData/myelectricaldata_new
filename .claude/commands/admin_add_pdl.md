# Page Administration - Ajouter un PDL

Tu travailles sur la page `/admin/add-pdl` de l'application MyElectricalData.

## Description de la page

Cette page permet aux **administrateurs d'ajouter manuellement un PDL** (Point De Livraison) à un utilisateur sans passer par le consentement Enedis.

## Fonctionnalités actuelles (implémentées)

1. **Sélection de l'utilisateur avec auto-complétion**
   - **Recherche interactive d'utilisateur**
     - Auto-complétion en temps réel lors de la saisie
     - Recherche par email ou Client ID
     - Dropdown avec résultats filtrés
     - Affichage du nombre de résultats trouvés
     - Navigation au clavier (↑/↓ pour naviguer, Enter pour sélectionner, Esc pour fermer)
     - Surbrillance de l'élément actif à la souris ou au clavier
     - Affichage des informations utilisateur (email, client ID, date de création, statut admin)
     - Bouton de réinitialisation (×) pour changer d'utilisateur
     - Messages contextuels (aucun résultat, commencer à taper)
   - **Comportement**
     - Si aucun utilisateur sélectionné : le PDL est ajouté au compte de l'administrateur connecté
     - Si utilisateur sélectionné : le PDL est ajouté au compte de l'utilisateur choisi

2. **Informations du PDL**
   - **Numéro de PDL** (usage_point_id) - **Requis**
     - Validation du format (14 chiffres exactement)
     - Accepte uniquement les chiffres (filtre automatique)
     - Affichage en police monospace
   - **Nom personnalisé** (optionnel)
     - Nom convivial pour identifier le PDL
     - Limite de 100 caractères

3. **Validation**
   - Vérification du format du numéro PDL (14 chiffres)
   - Validation du format email si fourni
   - Messages d'erreur spécifiques selon le cas

4. **Notifications**
   - **Succès** : Message confirmant l'ajout avec précision du compte cible
   - **Erreur** : Affichage du message d'erreur retourné par l'API
   - Toast dismissible avec bouton de fermeture

5. **Actions post-création**
   - Réinitialisation automatique du formulaire après succès
   - La notification reste affichée jusqu'à fermeture manuelle

## Fonctionnalités implémentées récemment

1. **Sélection avancée de l'utilisateur** ✅
   - Liste déroulante avec auto-complétion
   - Recherche par email ou client_id
   - Affichage des informations de l'utilisateur sélectionné
   - Navigation au clavier complète

2. **Options avancées du PDL** ✅
   - Puissance souscrite (menu déroulant 3-36 kVA)
   - Configuration des heures creuses (ajout/suppression de plages)
   - Type de consommation (consommation/production/mixte)
   - Statut actif/inactif
   - Dates (activation du contrat, données les plus anciennes)

3. **Améliorations UX** ✅
   - Option "Ajouter un autre PDL" pour créations multiples
   - Redirection automatique vers le PDL créé après 2 secondes
   - Compteur de caractères pour le PDL
   - Notifications colorées (succès/erreur/warning)

## Fonctionnalités à implémenter (côté backend)

1. **API manquantes**
   - Endpoint pour récupérer les PDLs d'un utilisateur spécifique
   - Endpoint pour vérifier l'unicité d'un PDL
   - Support des paramètres avancés dans l'endpoint adminAddPdl

2. **Améliorations futures possibles**
   - Boîte de dialogue de confirmation si le PDL existe déjà
   - Import en masse de PDLs depuis un fichier CSV
   - Historique des PDLs ajoutés récemment
   - Prévisualisation des informations Enedis du PDL

## Cas d'usage

- **Test et développement** : Ajouter des PDL de test
- **Migration de données** : Import de PDL existants
- **Support utilisateur** : Résoudre des problèmes de consentement
- **Situations exceptionnelles** : Cas où le consentement Enedis ne fonctionne pas

## API utilisée

La page utilise deux endpoints différents selon le cas :

- **Sans email** : `pdlApi.create()` - Ajoute le PDL au compte de l'utilisateur connecté
- **Avec email** : `pdlApi.adminAddPdl()` - Ajoute le PDL au compte de l'utilisateur spécifié (admin uniquement)

## Différences avec le consentement Enedis

| Aspect | Consentement Enedis | Ajout admin actuel | Ajout admin futur |
|--------|-------------------|-------------------|-------------------|
| Données récupérées | Automatique depuis Enedis | Aucune | Aucune |
| Validation | Par Enedis | Format PDL uniquement | Format + unicité |
| Puissance souscrite | Auto-détectée | Non géré | Saisie manuelle |
| Heures creuses | Auto-détectées | Non géré | Saisie manuelle |
| Consentement utilisateur | Requis | Non requis | Non requis |

## Permissions requises

- **Rôle** : Administrateur uniquement
- **Permission** : `pdl:create`, `admin:manage`

## Technologies utilisées

- React avec TypeScript
- React Query pour les mutations
- Tailwind CSS pour le style
- Support du mode sombre

## Fichiers liés

- **Frontend** : `apps/web/src/pages/AdminAddPDL.tsx`
- **API** : `apps/web/src/api/admin.ts`, `apps/web/src/api/pdl.ts`
- **Types** : `apps/web/src/types/api.ts`
- **Backend** : `apps/api/src/routers/admin.py`, `apps/api/src/routers/pdl.py`

## Navigation

Cette page est accessible via :

- **Lien direct** : `/admin/add-pdl`
- **Retour au Dashboard** : Lien en haut de la page pour revenir au tableau de bord principal

## Notes importantes

- Cette fonctionnalité est réservée aux administrateurs et doit être utilisée avec précaution
- Les PDL ajoutés manuellement n'ont pas de données de consommation automatiques
- Il faut ensuite déclencher manuellement la récupération des données via l'API Enedis
- Le numéro de PDL doit être valide et existant chez Enedis
- L'interface affiche un avertissement orange rappelant que c'est une fonction administrative
- L'utilisateur pourra ensuite lier son compte Enedis normalement
- Le formulaire se réinitialise automatiquement après un ajout réussi

## Composants UI utilisés

- **Card** : Structure principale du formulaire
- **Input** : Champs de saisie (email, PDL, nom)
- **Button** : Bouton d'ajout avec état de chargement
- **Toast** : Notifications de succès/erreur dismissibles
- **Alert** : Avertissement administrateur (orange) et section info (bleue)
- **Icons** : Lucide React (Activity, CheckCircle, XCircle, AlertCircle, ArrowLeft)
- **Mode sombre** : Support complet avec classes Tailwind dark:
