---
name: faq
id: faq
path: /faq
description: Foire Aux Questions pour aider les utilisateurs
mode_client: false
mode_server: true
menu: FAQ
---

# Page FAQ

Page affichant la **Foire Aux Questions** (FAQ) pour aider les utilisateurs à comprendre et utiliser l'application.

## Features

| Feature                         | Statut |
| ------------------------------- | ------ |
| Questions par categorie         | FAIT   |
| Systeme d'accordeon             | FAIT   |
| Recherche                       | FAIT   |
| Liens utiles                    | FAIT   |
| Contact support                 | FAIT   |

## Fichiers

| Type    | Fichier                        |
| ------- | ------------------------------ |
| Page    | `apps/web/src/pages/FAQ.tsx`   |

## Details implementation

### Questions par categorie (FAIT)

- **Général** : Questions sur l'application et son fonctionnement
- **Compte et connexion** : Création de compte, connexion, mot de passe
- **PDL et consentement Enedis** : Gestion des Points De Livraison
- **Consommation** : Récupération et affichage des données
- **Simulateur** : Comparaison des offres
- **TEMPO et EcoWatt** : Informations spécifiques
- **Problèmes techniques** : Dépannage et erreurs courantes

### Systeme d'accordeon (FAIT)

- Questions pliables/dépliables
- Ouverture d'une question à la fois ou plusieurs simultanément
- Icônes pour indiquer l'état (ouvert/fermé)

### Recherche (FAIT)

- Barre de recherche pour filtrer les questions
- Mise en évidence des termes recherchés
- Affichage du nombre de résultats

### Liens utiles (FAIT)

- Liens vers les pages de l'application
- Liens vers la documentation externe (Enedis, RTE, etc.)
- Tutoriels vidéo si disponibles

### Contact support (FAIT)

- Lien vers le formulaire de contact
- Email de support
- Temps de réponse moyen

## Catégories de questions typiques

### Général

- Qu'est-ce que MyElectricalData ?
- L'application est-elle gratuite ?
- Mes données sont-elles sécurisées ?

### Compte et connexion

- Comment créer un compte ?
- J'ai oublié mon mot de passe
- Comment supprimer mon compte ?

### PDL et consentement Enedis

- Qu'est-ce qu'un PDL ?
- Comment donner mon consentement à Enedis ?
- Le consentement expire-t-il ?

### Consommation

- Pourquoi mes données ne remontent pas ?
- Quelle est la période de données disponibles ?
- Comment sont calculées les heures creuses/pleines ?

### Simulateur

- Comment fonctionne le simulateur ?
- Les prix sont-ils à jour ?
- Puis-je ajouter une offre manquante ?

## Notes importantes

- La FAQ doit être mise à jour régulièrement avec les nouvelles questions fréquentes
- Les réponses doivent être claires et concises
- Inclure des liens vers les pages pertinentes de l'application
- Ajouter des captures d'écran pour les procédures complexes
