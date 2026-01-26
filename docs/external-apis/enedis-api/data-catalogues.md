# Catalogue des données

Un client peut partager avec vous, via le service Enedis Data Connect, les données suivantes :

| Catégorie                  | Donnée                                             | Description fonctionnelle                                                                                        |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Comptage                   | Courbe de consommation                             | Puissance électrique soutirée moyenne par intervalle d’acquisition du compteur (par défaut 30 minutes), en watts |
| Comptage                   | Consommation quotidienne                           | Quantité quotidienne d’électricité consommée, en wattheures                                                      |
| Comptage                   | Puissance maximale quotidienne consommée           | Puissance maximale soutirée par jour, en kVA                                                                     |
| Comptage                   | Courbe de production                               | Puissance électrique injectée moyenne par intervalle d’acquisition du compteur (par défaut 30 minutes), en watts |
| Comptage                   | Production quotidienne                             | Quantité quotidienne d’électricité produite, en wattheures                                                       |
| Technique et contractuel\* | Identité du client                                 | Civilité, nom et prénom                                                                                          |
| Technique et contractuel\* | Données de contact                                 | Email et numéro de téléphone portable                                                                            |
| Technique et contractuel\* | Compteur                                           | Type de compteur électrique installé                                                                             |
| Technique et contractuel\* | Statut communicant                                 | Statut communicant du compteur Linky                                                                             |
| Technique et contractuel\* | Segment client                                     | Segment technique/contractuel de raccordement                                                                    |
| Technique et contractuel\* | Puissance souscrite                                | Puissance souscrite du contrat, en kVA                                                                           |
| Technique et contractuel\* | Date de mise en service                            | Date de dernière mise en service du contrat                                                                      |
| Technique et contractuel\* | Type de tarif d’acheminement                       | Type de tarif appliqué à l’accès au réseau                                                                       |
| Technique et contractuel\* | Date du dernier changement du tarif d’acheminement | Date de la dernière modification du tarif                                                                        |
| Technique et contractuel\* | Plage d’heures creuses                             | Plage d’heures creuses retenue pour l’acheminement                                                               |
| Technique et contractuel\* | État contractuel                                   | État du contrat de fourniture                                                                                    |
| Technique et contractuel\* | Adresse du point d’usage                           | Adresse du point de livraison ou de production                                                                   |
| Technique et contractuel\* | Identifiant du point d’usage                       | Numéro de PRM ou PDL                                                                                             |

_Attention, les données techniques et contractuelles sont disponibles uniquement sur les points de consommation et non sur les points de production._

## Données de comptage

### Courbe de consommation

- Sous-ressource : `/metering_data/consumption_load_curve`
- Champs : `value`, `date`, `interval_length`

La courbe de consommation correspond à la puissance active moyenne électrique soutirée au réseau en watts. Elle est calculée sur le pas de collecte de la courbe de charge (par défaut 30 minutes) et permet de visualiser l’évolution de la puissance consommée au sein d’une même journée. Les puissances moyennes sont des données brutes enregistrées par le compteur certifié métrologiquement et collectées par Enedis.

Les données sont fournies par journée complète (de minuit à minuit). Elles sont restituées entre la date de début demandée et la veille de la date de fin. Chaque valeur est horodatée en heure locale au format `yyyy-mm-dd hh:mm:ss` et reflète l’horaire de fin de la plage considérée. Des données peuvent être manquantes en cas d’indisponibilités.

Un appel couvre au maximum 7 jours consécutifs. Pour obtenir 20 jours de courbe de consommation au pas 30 minutes, trois appels sont nécessaires. Les données peuvent remonter jusqu’à 24 mois et 15 jours avant la date d’appel.

La courbe de consommation quotidienne est relevée chaque matin par Enedis et mise à disposition à partir de 8h. Certains compteurs peuvent remonter leurs données plus tard dans la journée ; elles deviennent alors accessibles le lendemain à 8h. En situation exceptionnelle, la mise à disposition peut être retardée d’une à deux heures.

Le client doit activer l’enregistrement et la collecte de la courbe de consommation au pas 30 minutes depuis son espace client Enedis. Une fois activée, la courbe est également visible depuis cet espace.

Le paramètre `interval_length` indique le pas de mesure et peut prendre les valeurs suivantes :

- `PT10M` : pas de 10 minutes
- `PT15M` : pas de 15 minutes
- `PT30M` : pas de 30 minutes
- `PT60M` : pas de 60 minutes

Pour certains clients, la courbe peut être collectée à un pas de 10 minutes afin de faciliter des études réseau. Depuis septembre 2018, les compteurs posés mesurent par défaut la courbe au pas 1 heure et la stockent localement ; le client peut autoriser Enedis à collecter ces données. À compter de fin 2021, certains clients peuvent bénéficier d'un pas de 15 minutes dans le cadre de la mise en œuvre du règlement des écarts.

> `measure_type = "B"` indique que les données Linky partagées via Data Connect sont des données brutes.

#### Conversion des valeurs de puissance en énergie

**Important** : Les valeurs retournées par l'API sont en **Watts (W)** et représentent la **puissance moyenne** sur l'intervalle de mesure. Pour calculer l'énergie consommée en **Wattheures (Wh)**, il faut appliquer la formule suivante :

```
Énergie (Wh) = Puissance (W) / (60 / interval_minutes)
```

Où `interval_minutes` est extrait de `interval_length` :
- PT10M → 10 minutes → `Wh = W / 6`
- PT15M → 15 minutes → `Wh = W / 4`
- PT30M → 30 minutes → `Wh = W / 2`
- PT60M → 60 minutes → `Wh = W / 1`

**Exemple** : Pour une valeur de 1800 W sur un intervalle PT30M (30 minutes) :
- Énergie = 1800 W / (60 / 30) = 1800 / 2 = 900 Wh = 0,9 kWh

Cette conversion est nécessaire pour calculer correctement les consommations totales et les coûts associés.

### Consommation quotidienne

- Sous-ressource : `/metering_data/daily_consumption`
- Champs : `value`, `date`

La consommation quotidienne correspond à la quantité d’énergie active consommée par jour, en wattheures, pour un point de livraison donné. Les données sont calculées à partir des différences d’index enregistrées par le compteur Linky certifié.

Chaque valeur est datée au format `yyyy-mm-dd` et restituée entre la date de début demandée et la veille de la date de fin. Des périodes peuvent manquer. Un appel peut couvrir des données remontant jusqu’à 36 mois et 15 jours avant la date d’appel.

Les données sont relevées chaque matin et publiées à partir de 8h, avec les mêmes contraintes de disponibilité que pour la courbe de consommation.

### Puissance maximale de consommation quotidienne

- Sous-ressource : `/metering_data/consumption_max_power`
- Champs : `value`, `date`

La puissance maximale quotidienne correspond à la puissance apparente instantanée la plus élevée mesurée dans la journée, en voltampères. Ces valeurs sont des données brutes issues du compteur Linky et sont certifiées métrologiquement. L’organe de coupure du compteur compare cette puissance maximale à la puissance souscrite selon les règles détaillées dans la note technique CPT_54E (page 29).

Chaque valeur est horodatée en heure locale au format `yyyy-mm-dd hh:mm:ss`, indiquant le moment précis où la puissance maximale a été atteinte. Les données couvrent la période demandée (de la date de début à la veille de la date de fin) et peuvent comporter des absences. La profondeur historique maximale est de 36 mois et 15 jours.

Les mesures sont relevées une fois par jour, mises à disposition à partir de 8h et soumises aux mêmes contraintes de disponibilité que les autres données de comptage.

### Courbe de production

- Sous-ressource : `/metering_data/production_load_curve`
- Champs : `value`, `date`, `interval_length`

La courbe de production représente la puissance active moyenne injectée sur le réseau, en watts, sur un pas de 30 minutes par défaut. Elle permet de visualiser la production d’un client producteur (vente totale ou autoconsommation avec ou sans revente de surplus) au cours d’une journée. Les données sont brutes, certifiées et collectées par Enedis.

Les données sont restituées par journée complète, entre la date de début demandée et la veille de la date de fin. Chaque valeur est horodatée en heure locale au format `yyyy-mm-dd hh:mm:ss`. Des indisponibilités peuvent apparaître.

Le client doit activer la collecte de la courbe de production au pas 30 minutes depuis son espace client. Un appel couvre au maximum 7 jours consécutifs, avec une profondeur historique de 24 mois et 15 jours.

La mise à disposition intervient chaque jour à partir de 8h, avec les mêmes contraintes de disponibilité que pour la courbe de consommation.

> Pour les données Linky partageables via Data Connect, `measure_type = "B"` indique des données brutes.

### Production quotidienne

- Sous-ressource : `/metering_data/daily_production`
- Champs : `value`, `date`

La production quotidienne correspond à la quantité d’énergie active produite par jour, en wattheures, pour un point de livraison donné, que le client soit en vente totale ou en autoconsommation (avec ou sans revente de surplus). Les valeurs résultent des différences d’index relevées par Enedis sur le compteur Linky.

Chaque valeur est datée au format `yyyy-mm-dd`. Les données sont restituées entre la date de début demandée et la veille de la date de fin, avec une profondeur historique de 36 mois et 15 jours. Des périodes peuvent être absentes.

Les données sont relevées quotidiennement pendant la matinée et publiées à partir de 8h, avec les mêmes contraintes que les autres mesures de comptage.

## Données techniques et contractuelles

### Identité du client

- Sous-ressource : `/customers/identity`
- Champs : `title`, `firstname`, `lastname`

Pour un client particulier, il s’agit de la civilité, du nom et du prénom tels qu’ils sont enregistrés dans l’espace client Enedis.

### Données de contact

- Sous-ressource : `/customers/contact_data`
- Champs : `phone`, `email`

Les coordonnées disponibles sont l’adresse email et le numéro de téléphone mobile, lorsque le client les a renseignés dans son espace client Enedis.

### Identifiant du point d’usage

- Sous-ressource : `/customers/usage_points/contracts`
- Champ : `usage_point_id`

L’identifiant du point d’usage (numéro de PDL pour les consommateurs ou PRM au sens général) comporte 14 chiffres et permet d’identifier de manière unique le point de connexion entre le client et Enedis. Il figure sur la facture d’électricité et sur l’afficheur du compteur Linky.

### Type de compteur

- Sous-ressource : `/customers/usage_points/contracts`
- Champ : `meter_type`

Le type de compteur installé sur le site peut prendre les valeurs suivantes :

- `EMC` : compteur électromécanique
- `CBE` : compteur bleu électronique
- `AMM` : compteur Linky
- `SSCPT` : site sans comptage

### Statut communicant du compteur

- Sous-ressource : `/customers/usage_points/contracts`
- Champ : `usage_point_status`

Cette donnée, disponible uniquement pour les points équipés d’un compteur Linky, précise si le compteur est communicant (`com`) ou non (`no_com`). Après la pose du compteur, une phase de mise en service du réseau peut durer quelques mois durant lesquels le compteur n’est pas communicant et aucune donnée de comptage n’est disponible.

### Segment client

- Sous-ressource : `/customers/usage_points/contracts`
- Champ : `segment`

Le segment correspond à la catégorisation technique et contractuelle du point de raccordement au réseau de distribution.

- Segment `C5` (points de consommation) : basse tension (220-240 V), puissance inférieure à 36 kVA, contrat unique avec le fournisseur.
- Segment `P4` (points de production) : basse tension (220-240 V), puissance inférieure à 36 kVA.

### Puissance souscrite

- Sous-ressource : `/customers/usage_points/contracts`
- Champ : `subscribed_power`

La puissance souscrite est la puissance apparente maximale soutirable par le client, exprimée en kVA. Paramétrée sur le compteur, elle peut être ajustée par le client ; le compteur disjoncte si la puissance soutirée dépasse cette valeur. Pour les clients C5 en contrat unique, la donnée provient du fournisseur d’électricité.

### Date de mise en service

- Sous-ressource : `/customers/usage_points/contracts`
- Champ : `last_activation_date`

La date de mise en service correspond à la dernière activation d’un contrat de fourniture pour le point considéré, après une période sans contrat actif. Elle reflète généralement la date d’emménagement ou la première mise en service après raccordement. Un changement de fournisseur n’entraîne pas une nouvelle mise en service. Pour les clients C5 en contrat unique, cette date provient de la demande de mise en service effectuée par le fournisseur.

### Type de tarif d’acheminement

- Sous-ressource : `/customers/usage_points/contracts`
- Champ : `distribution_tariff`

Cette donnée correspond au tarif d’acheminement payé par le fournisseur pour l’accès au réseau d’un point de consommation. Les tarifs sont régulés par la CRE et apparaissent sur la facture du client (rubrique TURPE). Trois facteurs conditionnent le tarif :

- la durée d’utilisation (rapport entre consommation annuelle et puissance souscrite) ;
- la différenciation temporelle (heures pleines/heures creuses) ;
- la différenciation saisonnière (hiver/été).

Les principaux codes de tarif sont :

- `BTINFCUST` : courte utilisation, sans différenciation temporelle ;
- `BTINFCUDT` : courte utilisation, heures pleines/heures creuses ;
- `BTINFMUST` : moyenne utilisation, sans différenciation temporelle ;
- `BTINFMUDT` : moyenne utilisation, heures pleines/heures creuses ;
- `BTINFLUST` : longue utilisation, sans différenciation temporelle ;
- `BTINFLUDT` : longue utilisation, heures pleines/heures creuses ;
- `BTINFCU4` : courte utilisation, heures pleines/heures creuses différenciées par saison ;
- `BTINFMU4` : moyenne utilisation, heures pleines/heures creuses différenciées par saison.

### Plage d’heures creuses pour la distribution

- Sous-ressource : `/customers/usage_points/contracts`
- Champ : `offpeak_hours`

Cette information n’est disponible que pour les consommateurs. Enedis définit pour chaque zone une plage de 8 heures d’heures creuses (une partie nocturne et éventuellement une plage méridienne). Les fournisseurs peuvent appliquer des tarifs différenciés sur ces plages et les répercuter dans leurs offres (heures super creuses, heures week-end, etc.).

### État contractuel

- Sous-ressource : `/customers/usage_points/contracts`
- Champ : `contract_status`

L’état contractuel décrit la situation d’accès au réseau :

- `SERVC` : en service ;
- `RESIL` : résilié ;
- `ECRES` : en service, en cours de résiliation ;
- `ECRAC` : en cours de raccordement ;
- `INACCE` : inaccessible.

### Adresse du point d’usage

- Sous-ressource : `/customers/usage_points/addresses`
- Champ : `usage_point_addresses`

L’adresse du point de livraison ou de production correspond à l’adresse postale du site, distincte le cas échéant de l’adresse de facturation. Elle est renseignée lors du raccordement initial et peut être mise à jour lors d’interventions. Certaines adresses sont normalisées et peuvent être accompagnées de coordonnées géographiques.
