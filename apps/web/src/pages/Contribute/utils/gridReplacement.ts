// Remplacement d'une grille tarifaire ouverte par une grille importée plus récente (MED-53, issue #145)
//
// Les périodes se comparent bornes incluses (periodsOverlap) : l'ancienne grille se clôt à la veille
// du début de la nouvelle, sinon le contrôle de doublons les voit se chevaucher d'un jour.

import type { EnergyOffer } from '@/api/energy'
import { getCleanOfferName } from './offerPricing'

/** Veille d'une date ('YYYY-MM-DD' ou ISO), au format 'YYYY-MM-DD'. */
export function dayBefore(date: string): string {
  // Jour calendaire de la chaîne, sans passer par le fuseau du navigateur
  const day = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}

/**
 * Offres de la grille ouverte que remplace une grille importée débutant le `importValidFrom`.
 *
 * `existingForType` : offres actives du fournisseur pour le type importé.
 * Rend toutes les puissances de la grille à clôturer, même celles absentes de l'import
 * (la nouvelle grille remplace l'ancienne en entier), ou [] s'il n'y a rien à remplacer.
 */
export function findOpenGridToClose(
  existingForType: EnergyOffer[],
  offerName: string,
  importValidFrom: string,
): EnergyOffer[] {
  // Dates comparées en jour calendaire 'YYYY-MM-DD', comme dayBefore : indépendant du fuseau
  const name = getCleanOfferName(offerName).toLowerCase()
  const importDay = importValidFrom.slice(0, 10)
  return existingForType.filter(o =>
    !o.valid_to &&
    !!o.valid_from &&
    o.valid_from.slice(0, 10) < importDay &&
    getCleanOfferName(o.name).toLowerCase() === name
  )
}

/**
 * Grille ouverte du même nom qui débute APRÈS la grille importée, s'il y en a une.
 *
 * Elle ne se clôt pas avant son début : l'import reste bloqué en doublon, et le message cite sa
 * date pour qu'on la corrige (ex. Enercoop, grille d'août saisie au 08/10, revue de la PR #158).
 */
export function findLaterOpenGrid(
  existingForType: EnergyOffer[],
  offerName: string,
  importValidFrom: string,
): EnergyOffer | undefined {
  const name = getCleanOfferName(offerName).toLowerCase()
  const importDay = importValidFrom.slice(0, 10)
  return existingForType.find(o =>
    !o.valid_to &&
    !!o.valid_from &&
    o.valid_from.slice(0, 10) > importDay &&
    getCleanOfferName(o.name).toLowerCase() === name
  )
}
