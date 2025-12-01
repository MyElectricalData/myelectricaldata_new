import { useState, useEffect } from 'react'
import { Euro, Database, ArrowRight, AlertCircle } from 'lucide-react'
import { usePdlStore } from '@/stores/pdlStore'

export default function ConsumptionEuro() {
  const { selectedPdl: selectedPDL } = usePdlStore()
  const [isDarkMode, setIsDarkMode] = useState(false)

  // Detect dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'))
    }
    checkDarkMode()
    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="w-full">
      {/* Coming Soon / Work in Progress State */}
      <div className="rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-6">
            <Euro className="w-10 h-10 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Consommation en Euros
          </h3>
          <p className="text-gray-600 dark:text-gray-400 max-w-md mb-6">
            Cette fonctionnalité est en cours de développement. Elle vous permettra de visualiser
            votre consommation électrique convertie en euros selon les tarifs de votre fournisseur.
          </p>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 max-w-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium mb-1">
                  Fonctionnalités à venir :
                </p>
                <ul className="text-sm text-blue-700 dark:text-blue-300 list-disc list-inside space-y-1">
                  <li>Conversion de la consommation kWh en euros</li>
                  <li>Application des tarifs HC/HP selon votre abonnement</li>
                  <li>Comparaison des coûts par période</li>
                  <li>Estimation de la facture mensuelle</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Récupérez vos données kWh</span>
            <ArrowRight className="w-4 h-4" />
            <span>Sélectionnez une offre tarifaire</span>
            <ArrowRight className="w-4 h-4" />
            <span>Visualisez vos coûts</span>
          </div>
        </div>
      </div>
    </div>
  )
}
