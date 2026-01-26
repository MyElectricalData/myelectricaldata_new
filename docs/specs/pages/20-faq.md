---
id: faq
---
# Page FAQ

**Route:** `/faq`

## Description

Page affichant la **Foire Aux Questions** (FAQ) pour aider les utilisateurs à comprendre et utiliser l'application.

## Fonctionnalités principales

### 1. Questions organisées par catégorie

- **Général** : Questions sur l'application et son fonctionnement
- **Compte et connexion** : Création de compte, connexion, mot de passe
- **PDL et consentement Enedis** : Gestion des Points De Livraison
- **Consommation** : Récupération et affichage des données
- **Simulateur** : Comparaison des offres
- **TEMPO et EcoWatt** : Informations spécifiques
- **Problèmes techniques** : Dépannage et erreurs courantes

### 2. Système d'accordéon

- Questions pliables/dépliables
- Ouverture d'une question à la fois ou plusieurs simultanément
- Icônes pour indiquer l'état (ouvert/fermé)

### 3. Recherche

- Barre de recherche pour filtrer les questions
- Mise en évidence des termes recherchés
- Affichage du nombre de résultats

### 4. Liens utiles

- Liens vers les pages de l'application
- Liens vers la documentation externe (Enedis, RTE, etc.)
- Tutoriels vidéo si disponibles

### 5. Contact support

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

## Technologies utilisées

- React avec TypeScript
- Tailwind CSS pour le style
- Support du mode sombre
- Markdown pour le contenu des réponses

## Fichiers liés

- **Frontend** : `apps/web/src/pages/FAQ.tsx`
- **Contenu** : Peut être stocké dans un fichier JSON ou en base de données

## Notes importantes

- La FAQ doit être mise à jour régulièrement avec les nouvelles questions fréquentes
- Les réponses doivent être claires et concises
- Inclure des liens vers les pages pertinentes de l'application
- Ajouter des captures d'écran pour les procédures complexes
