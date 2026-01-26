---
name: admin_offers
id: offers
path: /admin/offers
description: Gestion des offres d'energie et scraping automatique
mode_client: false
mode_server: true
menu: Administration
subMenu: Offres
tab: Offres
---

# Offres d'énergie

Fichier : `apps/web/src/pages/Admin/Offers.tsx`

## Features

| Feature                   | Statut |
| ------------------------- | ------ |
| Gestion des fournisseurs  | FAIT   |
| Modal de previsualisation | FAIT   |
| Liste des offres          | FAIT   |
| Filtrage et recherche     | FAIT   |
| Modification d'offre      | FAIT   |
| Suppression d'offre       | FAIT   |
| Purge fournisseur         | FAIT   |

## Details implementation

### Gestion des fournisseurs (FAIT)

Section avec carte par fournisseur :

- **9 fournisseurs** : EDF, Enercoop, TotalEnergies, Primeo, Engie, ALPIQ, Alterna, Ekwateur, Octopus
- **~254 offres energetiques** au total
- Logo via Clearbit Logo API
- Nombre d'offres actives
- Date du tarif
- URLs des scrapers editables
- Bouton "Previsualiser" (icone Eye)
- Bouton "Purger" (icone Trash2, rouge)

### Modal de previsualisation (FAIT)

3 onglets avec compteurs :

- **Nouvelles offres** (fond vert) : Offres a creer
- **Mises a jour** (fond bleu) : Offres modifiees avec diff des prix
- **Desactivations** (fond rouge) : Offres a desactiver

Affichage :

- Nom, Type, Puissance, Prix, Date du tarif
- Diff : Ancien prix -> Nouveau prix (+X.X% ou -X.X%)
- Support tous types : BASE, HC/HP, TEMPO, SEASONAL, Week-end

Barre de progression :

- Demarrage (10%) -> API (60%) -> Cache (80%) -> Termine (100%)

Actions :

- Bouton "Annuler"
- Bouton "Appliquer les changements"

### Liste des offres (FAIT)

Tableau groupe par fournisseur :

- Sections pliables
- Tri alphabetique
- Checkbox de selection (+ selection SHIFT)
- Colonnes : Nom, Type, Puissance, Abonnement, Prix kWh, Date tarif
- Alerte si tarif > 6 mois
- Actions groupees : Activer, Desactiver, Supprimer

### Filtrage et recherche (FAIT)

- Recherche par nom d'offre
- Filtre fournisseur (dropdown)
- Filtre type (BASE, HC_HP, TEMPO, EJP, SEASONAL...)
- Filtre puissance (3-36 kVA)
- Toggle alertes tarifs anciens

### Modification d'offre (FAIT)

Modal avec formulaire :

- Informations generales : Nom
- Periode validite : Date application, fin validite
- Puissance et abonnement
- Tarifs selon type :
  - BASE : Prix semaine + week-end
  - HC/HP : HC/HP semaine + week-end
  - TEMPO : 6 prix (Bleu/Blanc/Rouge HC/HP)
  - EJP : Normal + Pointe
  - SEASONAL : Hiver/Ete HC/HP + Jour pointe

## Permissions requises

- **Permission `offers`** : Lecture, previsualisation
- **Permission `offers.edit`** : Modification, URLs scrapers
- **Permission `offers.delete`** : Suppression, purge

## Technologies

- React avec TypeScript
- React Query (useQuery, useMutation)
- Lucide React pour icones
- React Hot Toast pour notifications
- Tailwind CSS + dark mode

## API utilisee

| Endpoint                | Methode | Description                    |
| ----------------------- | ------- | ------------------------------ |
| `/admin/offers/preview` | GET     | Previsualisation (DRY RUN)     |
| `/admin/offers/refresh` | POST    | Application des changements    |
| `/admin/offers/purge`   | DELETE  | Suppression offres fournisseur |
| `/energy/providers`     | GET     | Liste fournisseurs             |
| `/energy/offers`        | GET     | Liste offres                   |
| `/energy/offers/{id}`   | PUT     | Mise a jour offre              |
| `/energy/offers/{id}`   | DELETE  | Suppression offre              |

## Notes

- Offres desactivees non proposees dans simulateur
- Tarifs > 6 mois signales avec alerte
- Puissances : 3, 6, 9, 12, 15, 18, 24, 30, 36 kVA
- Offres TEMPO : 6 tarifs (3 couleurs x 2 periodes)
- Logos via Clearbit Logo API
