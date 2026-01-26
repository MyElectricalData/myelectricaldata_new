---
name: admin_contributions
id: contributions
path: /admin/contributions
description: Moderation des contributions d'offres d'energie
mode_client: false
mode_server: true
menu: Administration
subMenu: Contributions
tab: Contributions
---

# Gestion des contributions

Fichier : `apps/web/src/pages/Admin/Contributions.tsx`

## Features

| Feature               | Statut |
| --------------------- | ------ |
| Statistiques          | FAIT   |
| Filtrage et recherche | FAIT   |
| Liste contributions   | FAIT   |
| Messagerie WhatsApp   | FAIT   |
| Actions individuelles | FAIT   |
| Actions en masse      | FAIT   |
| Auto-refresh          | FAIT   |

## Details implementation

### Statistiques (FAIT)

Cards affichant :

- **En attente** : Contributions a traiter (icone Clock, bleu)
- **Validees ce mois** : Approuvees ce mois (icone CheckCircle, vert)
- **Rejetees** : Total rejetees (icone XCircle, rouge)
- **Total validees** : Total approuvees (icone Users, violet)

**Top contributeurs** : 5 meilleurs avec avatar, email, badge contributions

### Filtrage et recherche (FAIT)

- Recherche par nom offre ou email contributeur
- Filtre par type : Tous, BASE, HC/HP, TEMPO, EJP
- Tri par date : Plus recent / Plus ancien

### Liste des contributions (FAIT)

**Affichage groupe par contributeur** : Les contributions sont regroupees par email du contributeur pour faciliter le traitement.

#### Bloc contributeur

- Avatar avec initiales
- Email du contributeur
- Nombre de contributions en attente
- Checkbox pour selectionner toutes les contributions du contributeur

#### Ligne compacte par offre (accordion)

Chaque offre s'affiche sur une seule ligne cliquable :

- Checkbox de selection individuelle
- Chevron (▶/▼) pour deplier/replier
- Nom de l'offre + nom du fournisseur
- Badges : type d'offre (BASE, HC/HP, TEMPO, EJP) + type de contribution
- Indicateur message non lu (point orange)
- Date de soumission

#### Details deplies (au clic)

En cliquant sur une ligne, les details complets s'affichent :

- **Informations fournisseur** : nom, site web, offre existante (si mise a jour)
- **Tarification** : abonnements (multi-puissance si power_variants), prix kWh
- **Comparaison des tarifs** : pour les mises a jour (`UPDATE_OFFER`), affichage cote a cote des anciens et nouveaux tarifs
- **Documentation** : liens vers fiche des prix et screenshot
- **Messagerie** : historique des echanges (composant ChatWhatsApp)
- **Actions** : boutons Approuver, Infos, Rejeter, Messages

#### Comparaison des tarifs (UPDATE_OFFER)

Pour les contributions de type "Mise a jour offre", une section speciale affiche :

- **Colonne rouge** : Tarifs actuels de l'offre existante
- **Colonne verte** : Nouveaux tarifs proposes par le contributeur

Cette comparaison permet a l'administrateur de valider rapidement si le changement de prix est legitime en visualisant l'ecart entre l'ancien et le nouveau tarif pour chaque composante (abonnement, BASE, HC, HP, tarifs TEMPO, tarifs EJP).

#### Support du nouveau format power_variants

- **Ancien format** : `pricing_data` avec `subscription_price` unique
- **Nouveau format** : `power_variants` avec tableau `[{power_kva, subscription_price}]`
- L'affichage s'adapte automatiquement au format utilise

### Messagerie style WhatsApp (FAIT)

Composant partage `ChatWhatsApp` :

- Bouton "Voir les echanges" (toggle)
- Indicateur message non lu (point orange clignotant)
- Bulles avec queues orientees selon expediteur
- Messages admin : a droite, fond vert/bleu
- Messages contributeur : a gauche, fond blanc/gris
- Horodatage "JJ/MM HH:MM"
- Double checkmark pour messages lus
- Auto-refresh silencieux toutes les 5 secondes
- Reponse rapide avec envoi via Entree

### Actions individuelles (FAIT)

- **Approuver** (vert) : Modal confirmation
- **Demander des infos** (bleu) : Modal avec messages rapides
- **Rejeter** (rouge) : Modal avec raisons predefinies :
  - Offre non valide, Lien invalide, Offre introuvable
  - Offre expiree, Doublon, Donnees incompletes

### Actions en masse (FAIT)

- Selection multiple avec checkboxes
- Selectionner tout (checkbox en entete)
- Barre d'actions flottante :
  - Compteur selection
  - Bouton "Approuver" (vert)
  - Bouton "Rejeter" (rouge)
  - Bouton "Annuler"

### Auto-refresh (FAIT)

- Rafraichissement toutes les 30 secondes
- Rafraichissement au focus fenetre
- Invalidation cache apres chaque action

## Permissions requises

- **Permission** : `contributions` (via `require_permission('contributions')`)

## Technologies

- React avec TypeScript
- React Query pour mutations, cache, auto-refresh
- Tailwind CSS + dark mode
- localStorage pour contributions lues

## API utilisee

| Endpoint                                  | Methode | Description         |
| ----------------------------------------- | ------- | ------------------- |
| `/energy/contributions/pending`           | GET     | Liste en attente    |
| `/energy/contributions/stats`             | GET     | Statistiques        |
| `/energy/contributions/{id}/approve`      | POST    | Approuver           |
| `/energy/contributions/{id}/reject`       | POST    | Rejeter             |
| `/energy/contributions/{id}/request-info` | POST    | Demander infos      |
| `/energy/contributions/{id}/messages`     | GET     | Historique messages |
| `/energy/contributions/bulk-approve`      | POST    | Approbation masse   |
| `/energy/contributions/bulk-reject`       | POST    | Rejet masse         |

## Workflow moderation

1. Utilisateur soumet via `/contribute`
2. Contribution en statut "En attente"
3. Indicateur clignote si contributeur repond
4. Administrateur examine
5. Dialogue via reponse rapide
6. Validation ou rejet
7. Notification email a l'utilisateur
8. Si validee, offre ajoutee en base

## Notes

- Messages non lus detectes cote backend (`has_unread_messages`)
- Contributions lues stockees dans localStorage
- Cache React Query invalide apres chaque action
- Regroupement par contributeur trie par date de contribution la plus recente
- Gestion automatique des deux formats de donnees (legacy `pricing_data` et nouveau `power_variants`)
