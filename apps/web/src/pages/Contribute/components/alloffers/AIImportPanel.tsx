// Panneau d'import IA : génération de prompt, saisie JSON, résultat d'import
// Visible uniquement en mode édition + fournisseur sélectionné + mode IA actif

import { Sparkles, Copy, AlertCircle } from 'lucide-react'
import { toast } from '@/stores/notificationStore'
import { generateAIPrompt } from '../../utils/aiPrompt'
import type { AllOffersState } from '../../hooks/useAllOffersState'

interface AIImportPanelProps {
  state: AllOffersState
  importAIJson: () => Promise<void>
}

export default function AIImportPanel({ state, importAIJson }: AIImportPanelProps) {
  const {
    sortedProviders,
    offersArray,
    filterProvider,
    aiJsonInput, setAiJsonInput,
    aiImportResult, setAiImportResult,
    setShowAIMode,
    setNewPowersData,
    setEditedOffers,
    setPowersToRemove,
    setDeprecatedOffers,
    setUnchangedOfferIds,
    setNewGroups,
    setEditedOfferNames,
  } = state

  const currentProvider = sortedProviders.find(p => p.id === filterProvider)
  const providerName = currentProvider?.name || '—'
  const currentOffers = offersArray.filter(o => o.provider_id === filterProvider)

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(generateAIPrompt(providerName, currentOffers))
    toast.success('Prompt copié dans le presse-papier')
  }

  const handleClose = () => {
    setShowAIMode(false)
    setAiJsonInput('')
    setAiImportResult(null)
    // Nettoyer les contributions générées par l'import AI
    setNewPowersData([])
    setEditedOffers({})
    setPowersToRemove([])
    setDeprecatedOffers([])
    setUnchangedOfferIds(new Set())
    setNewGroups([])
    setEditedOfferNames({})
  }

  return (
    <div className="border border-purple-200 dark:border-purple-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-purple-50 dark:bg-purple-900/30 px-4 py-3 flex items-center gap-2 border-b border-purple-200 dark:border-purple-700">
        <Sparkles size={18} className="text-purple-600 dark:text-purple-400" />
        <h3 className="font-semibold text-purple-800 dark:text-purple-200 text-sm">Import via IA</h3>
        <span className="text-xs text-purple-600 dark:text-purple-400 ml-auto">
          Fournisseur : {providerName}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Étape 1 : Prompt */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              1. Copiez ce prompt dans votre IA préférée
            </p>
            <button
              onClick={handleCopyPrompt}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-md hover:bg-purple-700 transition-colors"
            >
              <Copy size={14} />
              Copier le prompt
            </button>
          </div>
          <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-xs text-gray-700 dark:text-gray-300 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
            {generateAIPrompt(providerName, currentOffers)}
          </pre>
        </div>

        {/* Conseils sur les sources et vérification */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
            <AlertCircle size={14} />
            Comment utiliser ce prompt
          </p>
          <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1.5 ml-5 list-disc">
            <li><strong>Lancez le prompt seul</strong> — l'IA effectuera une recherche web pour trouver les tarifs officiels du fournisseur</li>
            <li>Pour fournir une source spécifique :
              <ul className="ml-4 mt-1 space-y-0.5 list-[circle]">
                <li><strong>Copier/coller le contenu</strong> : méthode la plus fiable. Ouvre le PDF ou la page web, sélectionne le tableau tarifaire et colle-le à la suite du prompt</li>
                <li><strong>Page HTML ou lien web</strong> : bonne alternative, l'IA peut souvent accéder aux pages publiques</li>
                <li><strong>Image (capture d'écran)</strong> : acceptable si les autres méthodes ne fonctionnent pas</li>
              </ul>
            </li>
            <li><strong>Évitez les PDF en pièce jointe</strong> — la structure interne des PDF rend la lecture difficile pour les IA (colonnes mélangées, tableaux mal interprétés)</li>
            <li>Dans tous les cas, <strong>vérifiez toujours les tarifs proposés</strong> avant de soumettre</li>
          </ul>
        </div>

        {/* Étape 2 : JSON input */}
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            2. Collez le JSON généré par l'IA
          </p>
          <textarea
            value={aiJsonInput}
            onChange={(e) => setAiJsonInput(e.target.value)}
            placeholder='{ "offers": [ ... ] }'
            className="w-full h-40 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-700 dark:text-gray-300 resize-y focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>

        {/* Résultat de l'import */}
        {aiImportResult && (
          <AIImportResultDisplay result={aiImportResult} />
        )}

        {/* Boutons */}
        <div className="flex gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Fermer
          </button>
          <button
            onClick={importAIJson}
            disabled={!aiJsonInput.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={16} />
            Importer
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Affichage du résultat d'import ---

function AIImportResultDisplay({ result }: { result: { success: boolean; message: string; details?: { offer_type: string; offer_name: string; matched: number; added: number; deprecated?: boolean; warning?: string }[] } }) {
  const lines = result.message.split('\n')
  const title = lines[0]
  const errorLines = lines.slice(1)

  return (
    <div className={`rounded-lg border p-3 text-sm ${
      result.success
        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
    }`}>
      <p className="font-medium mb-1">{result.success ? '✅' : '❌'} {title}</p>
      {errorLines.length > 0 && (
        <ul className="mt-2 space-y-1 list-none">
          {errorLines.map((line, idx) => (
            <li key={idx} className="text-xs flex items-start gap-1.5">
              <span className="text-red-400 mt-0.5 shrink-0">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
      {result.details && result.details.length > 0 && (
        <ul className="mt-2 space-y-1">
          {result.details.map((d, i) => (
            <li key={i} className="text-xs">
              <span className="font-medium">{d.offer_name}</span>
              <span className="text-gray-500 dark:text-gray-400"> ({d.offer_type})</span>
              {' : '}
              {d.deprecated ? (
                <span className="text-orange-600 dark:text-orange-400 font-medium">obsolète — suppression proposée</span>
              ) : (
                <>
                  {d.matched > 0 && <span>{d.matched} mise(s) à jour</span>}
                  {d.matched > 0 && d.added > 0 && ', '}
                  {d.added > 0 && <span className="text-blue-500">{d.added} nouvelle(s) puissance(s)</span>}
                  {d.matched === 0 && d.added === 0 && <span className="text-gray-400">aucune correspondance</span>}
                </>
              )}
              {d.warning && (
                <span className="block mt-0.5 text-amber-600 dark:text-amber-400">
                  ⚠️ {d.warning}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
