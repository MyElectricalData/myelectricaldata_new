import AnalysisPeriodSettings from '@/components/AnalysisPeriodSettings'

/**
 * Préférences d'affichage du mode client.
 * La page « Mon compte » (/settings) étant réservée au mode serveur, cette page
 * expose en mode client les réglages qui ne dépendent pas du compte en ligne.
 */
export default function Preferences() {
  return (
    <div className="space-y-6">
      <AnalysisPeriodSettings />
    </div>
  )
}
