// Generation du prompt IA pour l'import de tarifs
// Fonction pure sans dependance React (texte pur)

import type { EnergyOffer } from '@/api/energy'
import { getCleanOfferName } from './offerPricing'

/**
 * Genere le prompt IA dynamiquement avec le nom du fournisseur et les offres existantes
 */
export function generateAIPrompt(
  providerName: string,
  currentOffers: EnergyOffer[]
): string {
  let currentOffersSection = ''

  if (currentOffers.length > 0) {
    const allPriceKeys = [
      'subscription_price', 'base_price', 'base_price_weekend',
      'hc_price', 'hp_price', 'hc_price_weekend', 'hp_price_weekend',
      'hc_price_summer', 'hp_price_summer', 'hc_price_winter', 'hp_price_winter',
      'tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp',
      'tempo_red_hc', 'tempo_red_hp', 'ejp_normal', 'ejp_peak',
    ] as const

    // Regrouper par offer_type + clean name + periode de validite
    const groups: Record<string, {
      type: string
      name: string
      validFrom: string | null
      validTo: string | null
      powers: Array<{ power_kva: number; fields: Record<string, number> }>
    }> = {}

    for (const offer of currentOffers) {
      const cleanName = getCleanOfferName(offer.name)
      const validFrom = offer.valid_from ? new Date(offer.valid_from).toLocaleDateString('sv-SE') : null
      const validTo = offer.valid_to ? new Date(offer.valid_to).toLocaleDateString('sv-SE') : null
      const key = `${offer.offer_type}::${cleanName}::${validFrom || ''}::${validTo || ''}`

      if (!groups[key]) {
        groups[key] = { type: offer.offer_type, name: cleanName, validFrom, validTo, powers: [] }
      }

      const power = offer.power_kva || 0
      if (power > 0) {
        const fields: Record<string, number> = {}
        for (const k of allPriceKeys) {
          const val = (offer as unknown as Record<string, unknown>)[k]
          if (val !== null && val !== undefined && !isNaN(Number(val))) {
            fields[k] = Number(val)
          }
        }
        groups[key].powers.push({ power_kva: power, fields })
      }
    }

    // Construire le JSON des offres existantes
    const existingOffersJson = Object.values(groups).map(g => {
      g.powers.sort((a, b) => a.power_kva - b.power_kva)
      return {
        offer_name: g.name,
        offer_type: g.type,
        valid_from: g.validFrom,
        valid_until: g.validTo,
        power_variants: g.powers.map(p => ({ power_kva: p.power_kva, ...p.fields })),
      }
    })

    const totalOffers = currentOffers.length
    const groupCount = Object.keys(groups).length

    currentOffersSection = `

## Offres actuellement enregistrees en base pour "${providerName}"

\`\`\`json
${JSON.stringify(existingOffersJson, null, 2)}
\`\`\`

**Total : ${totalOffers} lignes tarifaires reparties sur ${groupCount} offre(s).**

## IMPORTANT — Regles de comparaison avec la base existante

**NE RETOURNE QUE les offres qui ne sont PAS deja en base** (nouvelles grilles tarifaires, nouvelles offres).

Compare chaque offre trouvee avec le JSON ci-dessus :
- **Offre identique** (meme nom, meme type, meme periode, memes prix) → **NE PAS l'inclure** dans ton JSON de retour.
- **Offre avec nouveaux tarifs** (meme nom, meme type, mais periode de validite differente) → L'inclure comme **nouvelle offre** avec le bon \`valid_from\`.
- **Offre qui N'EXISTE PLUS** chez le fournisseur et qui est en base SANS \`valid_until\` → L'inclure avec \`"deprecated": true\` et un \`"warning"\` expliquant qu'elle semble avoir ete supprimee ou remplacee.
- **Offre RENOMMEE** → Utiliser le nouveau nom et ajouter un \`"warning"\` mentionnant l'ancien nom.
- **NOUVELLE offre** non presente en base → L'inclure normalement.

Si TOUTES les offres trouvees sont deja identiques en base, retourne un JSON avec un tableau \`"offers"\` vide et un message expliquant que tout est a jour.`
  }

  return `Tu es un assistant specialise dans les tarifs d'electricite en France.

## Methode recommandee

- **Compare PLUSIEURS sources** pour fiabiliser les prix : site officiel du fournisseur, grilles tarifaires PDF, comparateurs (selectra.info, jechange.fr, fournisseurs-electricite.com, etc.)
- En cas de divergence entre sources, privilegie la grille officielle du fournisseur et ajoute un warning mentionnant l'ecart constate
- Active le mode **"tasks"** (ou equivalent multi-etapes) de ton IA pour traiter chaque offre separement et aller plus vite
- N'hesite pas a faire plusieurs recherches successives si le fournisseur propose beaucoup d'offres

Je souhaite obtenir les grilles tarifaires actuelles du fournisseur "${providerName}".

Genere un JSON contenant TOUTES les offres disponibles de ce fournisseur.

## Format JSON requis

\`\`\`json
{
  "provider_name": "${providerName}",
  "data_source": "Description de la source (ex: grille tarifaire PDF telechargee depuis le site officiel)",
  "extraction_date": "YYYY-MM-DD",
  "offers": [
    {
      "offer_name": "Nom de l'offre (sans puissance ni type)",
      "offer_type": "TYPE",
      "valid_from": "YYYY-MM-DD",
      "valid_until": "YYYY-MM-DD ou null",
      "special_conditions": "optionnel - conditions particulieres",
      "warning": "optionnel - si incertitude ou remarque",
      "deprecated": false,
      "power_variants": [
        {
          "power_kva": 6,
          "subscription_price": 12.34,
          "...champs_prix_selon_type..."
        }
      ]
    }
  ]
}
\`\`\`

## Types d'offres disponibles et leurs champs

Il existe exactement **8 types**. Chaque type a des champs prix **obligatoires**. Le champ \`subscription_price\` (abonnement mensuel TTC en euros/mois) est obligatoire pour TOUS les types.

**IMPORTANT — Mapping obligatoire :**
- Chaque offre du fournisseur DOIT etre associee a l'un des 8 types ci-dessous
- Analyse la structure tarifaire de l'offre (nombre de prix, periodes HC/HP, saisons, etc.) pour determiner le type correspondant
- Si une offre ne correspond a AUCUN des 8 types (structure tarifaire inconnue, tarification dynamique, indexation spot, etc.), ajoute un \`"warning"\` expliquant le probleme et indique a l'utilisateur de contacter un administrateur ou moderateur pour creer un nouveau type d'offre

### BASE — Tarif unique
Un seul prix du kWh, identique a toute heure.

| Champ | Description |
|-------|-------------|
| \`base_price\` | Prix du kWh TTC |

Exemple :
\`\`\`json
{ "power_kva": 6, "subscription_price": 12.03, "base_price": 0.195200 }
\`\`\`

### HC_HP — Heures Creuses / Heures Pleines
2 prix selon l'heure (HC = nuit/creux, HP = jour/plein).

| Champ | Description |
|-------|-------------|
| \`hc_price\` | Prix du kWh en Heures Creuses |
| \`hp_price\` | Prix du kWh en Heures Pleines |

Exemple :
\`\`\`json
{ "power_kva": 6, "subscription_price": 12.60, "hc_price": 0.163500, "hp_price": 0.208100 }
\`\`\`

### TEMPO — 6 tarifs (3 couleurs x HC/HP)
Jours bleus (300j/an, les moins chers), blancs (43j/an) et rouges (22j/an, les plus chers), chacun avec HC et HP.

| Champ | Description |
|-------|-------------|
| \`tempo_blue_hc\` | Jour Bleu — Heures Creuses |
| \`tempo_blue_hp\` | Jour Bleu — Heures Pleines |
| \`tempo_white_hc\` | Jour Blanc — Heures Creuses |
| \`tempo_white_hp\` | Jour Blanc — Heures Pleines |
| \`tempo_red_hc\` | Jour Rouge — Heures Creuses |
| \`tempo_red_hp\` | Jour Rouge — Heures Pleines |

Exemple :
\`\`\`json
{ "power_kva": 9, "subscription_price": 15.84, "tempo_blue_hc": 0.129200, "tempo_blue_hp": 0.160200, "tempo_white_hc": 0.148500, "tempo_white_hp": 0.189400, "tempo_red_hc": 0.141900, "tempo_red_hp": 0.756200 }
\`\`\`

### EJP — Effacement Jours de Pointe
Tarif normal la plupart du temps, tarif pointe tres eleve 20 jours par an.

| Champ | Description |
|-------|-------------|
| \`ejp_normal\` | Prix du kWh en periode Normale |
| \`ejp_peak\` | Prix du kWh en periode de Pointe |

Exemple :
\`\`\`json
{ "power_kva": 9, "subscription_price": 13.75, "ejp_normal": 0.153100, "ejp_peak": 0.689400 }
\`\`\`

### SEASONAL — Saisonnier (2 saisons x HC/HP)
4 prix selon la saison et l'heure. Selon le fournisseur, les 2 saisons peuvent etre :
- **Ete / Hiver** : ete = avril a octobre, hiver = novembre a mars
- **Eco / Sobriete** : Eco = 345 jours (saison basse), Sobriete = 20 jours (saison haute)

IMPORTANT : utiliser les champs \`summer\` pour la saison basse (ete ou Eco) et \`winter\` pour la saison haute (hiver ou Sobriete), quel que soit le nom commercial.

| Champ | Description |
|-------|-------------|
| \`hc_price_summer\` | HC saison basse (ete / Eco) |
| \`hp_price_summer\` | HP saison basse (ete / Eco) |
| \`hc_price_winter\` | HC saison haute (hiver / Sobriete) |
| \`hp_price_winter\` | HP saison haute (hiver / Sobriete) |

Exemple :
\`\`\`json
{ "power_kva": 9, "subscription_price": 14.27, "hc_price_summer": 0.142800, "hp_price_summer": 0.178500, "hc_price_winter": 0.167300, "hp_price_winter": 0.210900 }
\`\`\`

### BASE_WEEKEND — Base + Week-end
2 prix : un tarif semaine et un tarif week-end (souvent moins cher le week-end).

| Champ | Description |
|-------|-------------|
| \`base_price\` | Prix du kWh en semaine |
| \`base_price_weekend\` | Prix du kWh le week-end |

Exemple :
\`\`\`json
{ "power_kva": 6, "subscription_price": 12.03, "base_price": 0.208100, "base_price_weekend": 0.163500 }
\`\`\`

### HC_WEEKEND — HC/HP + Week-end
4 prix : HC et HP en semaine + HC et HP le week-end.

| Champ | Description |
|-------|-------------|
| \`hc_price\` | HC semaine |
| \`hp_price\` | HP semaine |
| \`hc_price_weekend\` | HC week-end |
| \`hp_price_weekend\` | HP week-end |

Exemple :
\`\`\`json
{ "power_kva": 9, "subscription_price": 14.27, "hc_price": 0.163500, "hp_price": 0.208100, "hc_price_weekend": 0.142800, "hp_price_weekend": 0.178500 }
\`\`\`

### HC_NUIT_WEEKEND — HC Nuit + Week-end
Identique a HC_WEEKEND mais avec heures creuses etendues la nuit et le week-end. Memes champs.

| Champ | Description |
|-------|-------------|
| \`hc_price\` | HC (nuit + week-end) |
| \`hp_price\` | HP (jour semaine) |
| \`hc_price_weekend\` | HC week-end |
| \`hp_price_weekend\` | HP week-end |

Exemple :
\`\`\`json
{ "power_kva": 9, "subscription_price": 14.27, "hc_price": 0.152300, "hp_price": 0.215800, "hc_price_weekend": 0.138700, "hp_price_weekend": 0.185400 }
\`\`\`
${currentOffersSection}

## Regles generales

- **provider_name** : DOIT etre exactement \`${providerName}\`
- **Tous les prix en TTC** (Toutes Taxes Comprises)
- **Separateur decimal** : point (0.187702), PAS virgule
- **Precision** : 6 decimales pour les prix kWh (ex: 0.187702 euros/kWh), 2 decimales pour les abonnements (ex: 12.03 euros/mois)
- **subscription_price** = abonnement mensuel TTC en euros/mois
- **offer_name** : ne doit PAS contenir la puissance ni le type d'offre
- **valid_from** : date de debut de validite de la grille tarifaire (YYYY-MM-DD)
- **valid_until** : date de fin de validite si connue, sinon null
- **deprecated** : true si l'offre n'est plus commercialisee

## Paliers de prix

ATTENTION : certains fournisseurs appliquent des prix differents selon les tranches de puissance (ex: 3-6 kVA, 7-20 kVA, >=21 kVA).

- Verifie attentivement les changements de tarif entre chaque ligne du tableau
- Les cellules fusionnees dans les tableaux indiquent souvent un meme prix pour plusieurs puissances
- Quand une cellule de prix est fusionnee sur plusieurs lignes, applique ce prix a TOUTES les puissances concernees
- Quand le prix change (nouvelle cellule), applique le nouveau prix aux puissances suivantes

## Puissances

- Inclure TOUTES les puissances proposees par le fournisseur pour chaque offre
- Les puissances courantes sont 3, 6, 9, 12, 15, 18, 24, 30, 36 kVA mais certains fournisseurs proposent d'autres valeurs (4, 5, 7, 8, 10, 11, etc. ou 42, 48, 64 kVA)
- Retourne chaque puissance trouvee sur la source
- Si certaines puissances listees dans les offres existantes ne sont pas visibles sur la source fournie, ajoute un warning au niveau de l'offre : "Puissance XX kVA non visible sur la source - tarif a confirmer"

## Erreurs courantes a eviter

1. **HT vs TTC** : Ne pas confondre les prix HT et TTC. Toujours prendre la colonne TTC.
2. **Tarif reglemente vs tarif fournisseur** : Les tableaux affichent souvent les deux cote a cote. Prendre uniquement les colonnes du fournisseur (ex: "Tarif Alpiq"), pas les colonnes "Tarifs reglementes".
3. **HC et HP inverses** : Verifier que les colonnes Heures Creuses et Heures Pleines ne sont pas inversees. HP est generalement plus cher que HC.
4. **Cellules fusionnees** : Attention aux cellules fusionnees qui masquent les changements de palier. Une cellule fusionnee sur plusieurs lignes = meme prix pour toutes ces puissances.
5. **Colonnes tronquees** : Si certaines colonnes ne sont pas visibles sur la capture, ajouter un warning et ne pas inventer de valeurs.
6. **Virgule vs point** : Les sources francaises utilisent la virgule (0,1877). Convertir en point dans le JSON (0.1877).
7. **Noms de champs** : Utiliser EXACTEMENT les noms de champs indiques pour chaque type. Ne pas inventer de variantes.

## Warnings

Ajoute un champ "warning" dans les cas suivants :
- Offre qui ne correspond pas exactement a un type standard
- Prix incertain ou partiellement visible
- Colonnes tronquees sur la capture
- Puissances manquantes par rapport aux offres existantes
- Conditions speciales de l'offre

Exemples :
- "warning": "Cette offre a des horaires HC specifiques non standards"
- "warning": "Offre avec remise variable non modelisable dans les types standards"
- "warning": "Prix HP pour puissances 6-20 kVA non visibles sur la capture - valeurs presumees identiques a >=21 kVA"
- "warning": "Puissance 64 kVA non visible sur la source fournie"

## Sortie attendue

Avant le JSON, affiche un resume sous cette forme :

**Resume :**
- Offre X (TYPE) : Y puissance(s)
- Offre Z (TYPE) : Y puissance(s)
- **Total : N lignes tarifaires**

Puis retourne le JSON complet.`
}
