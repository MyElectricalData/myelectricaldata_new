---
sidebar_position: 1
---

# Frontend Utilisateur

## Contexte

L'interface web agit comme point d'entree principal pour les particuliers souhaitant utiliser la passerelle Enedis. Elle doit guider l'utilisateur depuis la decouverte du service jusqu'a l'obtention de sa cle API et la gestion de son compte, tout en restant conforme aux obligations de consentement et de securite definies dans `docs/features-spec/01-gateway.md` et `docs/features-spec/02-account.md`.

## Objectifs UX

- Expliquer clairement la valeur du service et les contraintes d'acces aux API Enedis.
- Simplifier le parcours de consentement Enedis, avec feedback et gestion des erreurs.
- Permettre la creation et la gestion d'un compte utilisateur de maniere intuitive.
- Donner acces aux informations techniques (client_id, client_secret, PDL) tout en respectant la confidentialite.
- Offrir une experience responsive (mobile, tablette, desktop) avec mode clair/sombre.

## Pages principales

### Accueil (Landing)

- Message principal sur la passerelle et rappel que les API Enedis sont reservees aux professionnels.
- Section "Comment ca marche" en trois etapes : Consentement Enedis, Creation de compte, Obtention de la cle API.
- Bouton primaire `Demarrer` redirigeant vers la creation de compte ou l'espace utilisateur si deja connecte.
- CTA secondaire vers la documentation technique.
- Bloc d'information sur la politique de cache (5 appels/seconde) et la securite (donnees chiffre avec la cle API utilisateur).

### Authentification

- Pages Login / Register dediees.
- Enregistrement necessite email, mot de passe, acceptation CGU et lien vers politique de confidentialite.
- Post inscription : affichage clair des prochaines etapes pour lancer la demande de consentement.
- Fonction de reinitialisation de mot de passe via email.

### Consentement Enedis

- Page explicative avant redirection vers l'URL OAuth Enedis (`docs/features-spec/01-gateway.md`).
- Lecture de l'etat de consentement : en attente, valide, expire, refuse.
- Gestion des erreurs de retour : affichage des messages issus de l'API et proposition de reessayer.
- Indicateur clair quand le consentement est valide (badge + date d'expiration).

### Tableau de bord utilisateur

- Resume : statut consentement, nombre de PDL rattaches, quotas d'appels, dernier rafraichissement cache.
- Bloc `Identifiants API` avec affichage du `client_id` et possibilite de reveler/masquer le `client_secret` (double confirmation avant affichage). Aucun telechargement automatique.
- Section `Points de livraison` : liste, ajout, edition, suppression. Chaque PDL affiche la date de dernier sync et son statut.
- Historique des appels recents (derniers succes/erreurs) pour debug basique.

### Parametres compte

- Edition des informations personnelles (nom, email) et changement de mot de passe.
- Bouton `Supprimer mon compte` avec double confirmation (modale + saisie mot de passe ou code). Expliciter que cette action purge les donnees et le cache.
- Lien vers gestion RGPD (contact, export donnees si requis).

## Parcours utilisateur cible

1. Arrivee sur la landing, lecture des informations, clic sur `Demarrer`.
2. Creation de compte -> confirmation, redirection vers tableau de bord avec etapes guidees.
3. Lancement du consentement Enedis depuis le tableau de bord -> redirection, validation, retour sur l'app.
4. Affichage du statut consentement valide, invitation a declarer des PDL.
5. Consultation des identifiants API et integration via documentation.
6. Utilisation reguliere, surveillance des quotas et gestion du cache implicitement.
7. Possibilite de suppression de compte a tout moment.

## Exigences fonctionnelles

- Navigation protegée : seules les pages publiques (landing, login, register) accessibles sans authentification.
- Gestion etat auth via token (JWT ou session) ; rafraichissement silencieux.
- Affichage unifie des erreurs API selon le schema `docs/features-spec/rules/api-design.json`.
- Systemes de notifications (toast) pour confirmations et erreurs critiques.
- Support du cache cote client uniquement pour UX (pas de donner sensibles stockees).

## Contraintes UI/UX

- Respect WCAG AA : contraste, navigation clavier, lecteurs d'ecran.
- Mode sombre complet :
  - Activation via toggle persistant (localStorage) + detection initiale de `prefers-color-scheme`.
  - Palette dediee pour fond, texte, elements interactifs, en garantissant le contraste AA.
  - Illustrations et logos compatibles (versions claires/sombres si necessaire).
- Design system base sur composants reutilisables (boutons, alertes, cartes, formulaires).
- Formulaires avec validation inline et messages d'aide.
- Responsive : breakpoints principaux 480px, 768px, 1024px, 1440px.

## Integration API

- Consulter `docs/features-spec/01-gateway.md` pour la mise en place du bouton de consentement et les messages explicatifs.
- Consulter `docs/features-spec/02-account.md` pour les operations de compte (creation, suppression, PDL, affichage des identifiants).
- Consulter `docs/features-spec/10-cache.md` pour la communication autour du cache et les indicateurs de rafraichissement.
- Gestion des erreurs API `docs/features-spec/rules/enedis-api-error.md` pour affichage utilisateur.

## Analytics et observabilite

- Suivi des evenements clefs : creation compte, lancement consentement, consentement valide, ajout PDL, consultation `client_secret`, suppression compte.
- Tracking conforme RGPD (banniere cookies si analytics externes).
- Logs front (niveau warning/error) envoyes a un endpoint backend pour diagnostic.

## Tests et qualite

- Tests unitaires sur les composants critiques (formulaires, toggles, cartes).
- Tests d'integration (React Testing Library) pour les parcours auth + consentement.
- Tests E2E (Cypress ou Playwright) couvrant le parcours utilisateur cible complet.
- Audit accessibilite (axe ou Lighthouse) et performance (Lighthouse >= 90).
