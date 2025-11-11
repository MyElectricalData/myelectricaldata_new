# Page Simulateur

Tu travailles sur la page `/simulator` de l'application MyElectricalData.

## Description de la page

Cette page permet aux utilisateurs de **comparer automatiquement toutes les offres d'électricité disponibles** en utilisant leurs données de consommation réelles sur les 12 derniers mois (année glissante).

## Fonctionnalités principales

1. **Configuration**
   - Sélection du PDL (Point De Livraison) si plusieurs PDL actifs
   - Auto-sélection du premier PDL actif si un seul disponible
   - Filtrage automatique des offres selon la puissance souscrite du PDL
   - Bouton "Lancer la simulation" avec état de chargement

2. **Récupération des données**
   - Chargement des données de consommation horaires sur 365 jours (jusqu'à hier)
   - Récupération par périodes de 7 jours avec chevauchement d'1 jour pour éviter les trous
   - Barre de progression avec :
     - Pourcentage d'avancement
     - Phase actuelle (dates et numéro de période)
     - Compteur de requêtes API
   - Cache React Query pour optimiser les performances (staleTime: 7 jours)
   - Gestion intelligente des erreurs ADAM-ERR0123 (compteur non activé avant la date)

3. **Résultats de simulation**
   - Tableau comparatif de toutes les offres classées par coût total annuel
   - Pour chaque offre :
     - Rang avec badge 🏆 pour la meilleure offre
     - Fournisseur et nom de l'offre
     - Type d'offre avec badge coloré (BASE, BASE_WEEKEND, HC_HP, HC_NUIT_WEEKEND, HC_WEEKEND, SEASONAL, TEMPO, EJP)
     - Coût de l'abonnement annuel
     - Coût de l'énergie annuel
     - Coût total annuel (en gras, coloré)
     - Écarts calculés :
       - vs. meilleure offre (montant et %)
       - vs. offre précédente (montant et %)
     - Badges d'alerte :
       - ⚠️ pour les offres avec descriptions d'avertissement
       - ⚠️ Ancien pour les tarifs de plus de 6 mois
   - Lignes cliquables pour voir les détails
   - Highlight visuel de la meilleure offre (fond vert)

4. **Détails expandables par offre**
   - Répartition de la consommation par type :
     - **BASE** : Semaine/Week-end (si tarif week-end)
     - **HC/HP** : HC/HP en semaine, HC/HP en week-end (si applicable)
     - **HC_NUIT_WEEKEND** : HC 23h-6h en semaine + tout le week-end
     - **HC_WEEKEND** : Tout le week-end + heures PDL en semaine
     - **SEASONAL** : HC/HP Hiver (nov-mars), HC/HP Été (avr-oct), Jours de pointe (si applicable)
     - **TEMPO** : Jours Bleus/Blancs/Rouges avec HC/HP pour chaque couleur
   - Calculs détaillés : kWh × prix unitaire = coût partiel
   - Grille tarifaire complète de l'offre
   - Puissance de l'offre (kVA)
   - Message d'avertissement si présent dans la description

5. **Export PDF**
   - Génération automatique d'un PDF multi-pages professionnel
   - Page 1 : Résumé avec :
     - Informations du PDL (numéro, nom, puissance)
     - Statistiques (consommation totale, nombre d'offres, meilleure offre, économies)
     - Top 10 des meilleures offres en tableau compact
   - Pages suivantes : Détail complet des 10 meilleures offres (1 page par offre)
     - Coût total et répartition abonnement/énergie
     - Écart vs. meilleure offre
     - Détails de l'offre (type, puissance, date de validité)
     - Grille tarifaire complète
     - Répartition de consommation avec calculs détaillés
   - Footer avec pagination et branding
   - Nom du fichier : `comparatif-offres-{PDL}-{YYYY-MM-DD}.pdf`

6. **Informations additionnelles**
   - Consommation totale sur la période analysée (kWh)
   - Économies potentielles : différence entre meilleure et pire offre
   - Bloc d'information toujours visible en bas de page

## Technologies utilisées

- React 18 avec TypeScript
- React Query (@tanstack/react-query) pour la gestion des requêtes et du cache
- jsPDF pour la génération de PDF multi-pages
- Tailwind CSS pour le style
- Lucide React pour les icônes
- Support complet du mode sombre

## Fichiers liés

- **Frontend** : `apps/web/src/pages/Simulator.tsx` (1768 lignes)
- **API Client** :
  - `apps/web/src/api/enedis.ts` (récupération des données de consommation)
  - `apps/web/src/api/energy.ts` (offres et fournisseurs)
  - `apps/web/src/api/tempo.ts` (couleurs TEMPO RTE)
  - `apps/web/src/api/pdl.ts` (gestion des PDL)
- **Types** : `apps/web/src/types/api.ts`
- **Backend** :
  - `apps/api/src/routers/enedis.py` (API Enedis)
  - `apps/api/src/routers/energy.py` (API offres et fournisseurs)
  - `apps/api/src/routers/tempo.py` (API couleurs TEMPO)
- **Utils** : `apps/web/src/utils/logger.ts` (logging)

## Types d'offres supportées

### 1. BASE
Tarif unique toute l'année.

### 2. BASE_WEEKEND
Tarif différencié semaine/week-end.

### 3. HC_HP (Heures Creuses / Heures Pleines)
Tarif double selon configuration PDL (ex: 22h-6h).

### 4. HC_NUIT_WEEKEND
HC de 23h à 6h en semaine + tout le week-end en HC.

### 5. HC_WEEKEND
Tout le week-end en HC + heures PDL en semaine.

### 6. SEASONAL (Saisonnier)
Tarif saisonnier avec HC/HP différenciés :
- Hiver (novembre à mars)
- Été (avril à octobre)
- Option : Jours de pointe (approximés par jours rouges TEMPO)

Offres spéciales Enercoop :
- **Flexi WATT nuit & week-end** : HC 23h-6h + week-end complet
- **Flexi WATT 2 saisons** :
  - Hiver : 0h-7h + 13h-16h en semaine, week-end complet
  - Été : 11h-17h en semaine, week-end complet
- **Flexi WATT 2 saisons + Pointe** : Comme 2 saisons + jours de pointe

### 7. TEMPO
Tarif EDF avec 3 couleurs de jours (données RTE) :
- Bleus (environ 300 jours/an) : tarifs bas
- Blancs (environ 43 jours/an) : tarifs moyens
- Rouges (22 jours/an) : tarifs élevés
Chaque couleur a des prix HC (22h-6h) et HP (6h-22h).

### 8. EJP (Effacement Jours de Pointe)
Tarif historique avec 22 jours de pointe par an.

## Logique technique importante

### Récupération des données
- Période : 365 jours glissants (de J-365 à J-1)
- Découpage en périodes de 7 jours avec chevauchement de 1 jour
- Conversion Wh → kWh selon interval_length (PT30M, PT60M)
- Détection et gestion des doublons
- Cache React Query avec staleTime de 7 jours

### Calcul des heures creuses
- Configuration PDL stockée dans `pdl.offpeak_hours` (format: `{"default": "22h30-06h30"}`)
- Parsing intelligent des formats : "22h30-06h30", "22:00-06:00", "HC (22H00-6H00)"
- Gestion des plages qui traversent minuit (ex: 22h-6h)
- Fallback par défaut : 22h-6h si pas de config

### Offres spéciales Enercoop
Logique personnalisée dans `getEnerocoopOffpeakHours()` :
- Détection par pattern dans le nom de l'offre
- Calcul des heures creuses selon le type (nuit & week-end, 2 saisons, pointe)
- Utilisation des jours fériés et saisons

### TEMPO
- Récupération des couleurs via API RTE (`tempoApi.getDays()`)
- Mapping date → couleur pour lookup rapide
- Gestion du cas UNKNOWN si couleur manquante (distribution égale)

### Gestion des erreurs
- **ADAM-ERR0123** : Compteur non activé avant cette date → arrêt anticipé mais traitement des données déjà récupérées
- **RATE_LIMIT_EXCEEDED** : Message clair à l'utilisateur avec suggestion
- Affichage des erreurs dans une bannière dismissible

### Export PDF
- Format A4 portrait
- Multi-pages avec pagination automatique
- Gestion des débordements de page
- Styles cohérents avec l'interface web
- Compression et optimisation

## Optimisations de performance

1. **Cache React Query partagé**
   - Les données de consommation sont mises en cache 7 jours
   - **Cache partagé avec la page Consumption** : Utilise la même clé `['consumptionDetail', pdl, start, end]`
   - Évite les appels API redondants lors des simulations multiples
   - Si l'utilisateur a déjà consulté ses données dans `/consumption`, le simulateur les réutilise instantanément
   - **Auto-lancement de simulation** : Si des données sont en cache (au moins 2/3 des périodes échantillonnées), la simulation se lance automatiquement à l'arrivée sur la page

2. **Récupération intelligente**
   - Vérification du cache avant chaque appel API
   - Log des cache HIT/MISS pour debugging
   - Arrêt anticipé si compteur non activé (évite appels inutiles)

3. **Détection de doublons**
   - Vérification des dates uniques
   - Warning en console si doublons détectés
   - Permet d'identifier les problèmes de chevauchement

4. **Lazy loading**
   - Détails des offres chargés uniquement si expandés
   - Optimisation du rendu du tableau

## Notes importantes

- Les données sont récupérées par périodes de 7 jours (pas mois par mois) pour optimiser les appels API
- Le cache React Query expire après 7 jours (pas 24h)
- La simulation utilise les tarifs réels stockés en base de données avec validation de fraîcheur (<6 mois)
- Les offres sont automatiquement filtrées selon la puissance souscrite du PDL (matching pattern "XX kVA")
- Les couleurs TEMPO sont récupérées en temps réel depuis l'API RTE
- Les jours de pointe (offres SEASONAL) sont approximés par les jours rouges TEMPO
- La configuration des heures creuses est spécifique à chaque PDL
- Support complet du mode sombre dans l'interface et les badges
