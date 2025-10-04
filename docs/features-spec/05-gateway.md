# Feature: Gateway API

## Contexte

Mettre à disposition une API passerelle entre les utilisateurs finaux et Enedis afin de leur permettre de récupérer leurs données Linky, même lorsque l'API Enedis n'est pas accessible directement aux particuliers.

## Objectifs

- Informer clairement les utilisateurs de la raison d'être du service et des conditions d'accès aux API Enedis (accès réservé aux professionnels disposant d'un SIRET).
- Présenter le flux de consentement obligatoire auprès d'Enedis et expliquer que la passerelle agit en leur nom pour interroger l'API Enedis.
- Garantir la sécurité et la confidentialité des données via un cache chiffré avec la clé API propre à chaque utilisateur.
- Offrir un point d'accès unifié à l'ensemble des endpoints documentés dans `docs/enedis-api`.

## Parcours utilisateur

1. L'utilisateur arrive sur la page d'accueil et découvre :
   - pourquoi le service est nécessaire (API Enedis réservée aux professionnels) ;
   - comment fonctionne le consentement Enedis et le rôle de la passerelle ;
   - la présence d'un cache chiffré par sa clé API personnelle.
2. L'utilisateur crée un compte sur la passerelle (email, mot de passe).
3. Depuis son tableau de bord, l'utilisateur clique sur **"Consentement Enedis"** (pas besoin de saisir de PDL).
4. La passerelle génère l'URL d'autorisation Enedis avec `state=user_id` :<br>`https://mon-compte-particulier.enedis.fr/dataconnect/v1/oauth2/authorize?client_id=XXXXXXXX&duration=P36M&response_type=code&state={user_id}`
5. Après validation du consentement sur le portail Enedis, celui-ci redirige vers `http://localhost:8000/consent?code=XXX&state={user_id}`.
6. La passerelle :
   - Échange le code contre un token OAuth
   - Appelle l'API Enedis `/customers_upc/v5/usage_points` pour récupérer **tous les PDL** du compte
   - Crée automatiquement les PDL en base de données
   - Crée les tokens OAuth pour chaque PDL
   - Redirige vers le dashboard avec un message de succès
7. L'utilisateur voit ses PDL automatiquement détectés et peut immédiatement récupérer ses données.

## Critères d'acceptation

- La page d'accueil décrit clairement :
  1. la nécessité du service (API Enedis réservée aux professionnels) ;
  2. le processus de consentement et la délégation d'appel à l'API Enedis ;
  3. l'existence du cache, le chiffrement par clé API utilisateur et l'impossibilité d'exploiter les données sans celle-ci.
- Le bouton "Consentement Enedis" est présent sur le **tableau de bord utilisateur** (pas sur la page d'accueil).
- Le consentement est **au niveau du compte Enedis**, pas par PDL individuel.
- Après consentement, la passerelle :
  1. Reçoit la redirection Enedis avec le code d'autorisation
  2. Échange le code contre un token OAuth
  3. Appelle automatiquement l'endpoint Enedis `/customers_upc/v5/usage_points`
  4. Crée tous les PDL détectés en base de données
  5. Crée les tokens OAuth pour chaque PDL
  6. Redirige vers le dashboard avec un message : "Bravo ! X points de livraison détectés (Y nouveaux)."
- Tous les appels sortants vers Enedis transitent par la passerelle en utilisant les identifiants `client_id` / `client_secret` stockés en variable d'environnement.
- Chaque endpoint documenté dans `docs/enedis-api` dispose d'un miroir côté passerelle.
- Le provisionnement et la gestion des comptes utilisateurs respectent les spécifications de `docs/features-spec/02-account.md`.

## API à exposer

- Parité fonctionnelle avec la documentation `docs/enedis-api`.
- Gestion des clés API utilisateur et des comptes décrite dans `docs/features-spec/02-account.md`.
