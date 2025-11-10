import { AlertCircle, Trash2 } from 'lucide-react'
import type { ConfirmModalProps } from '../types/consumption.types'

export function ConfirmModal({ showConfirmModal, setShowConfirmModal, confirmClearCache }: ConfirmModalProps) {
  if (!showConfirmModal) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertCircle className="text-red-600 dark:text-red-400" size={24} />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Confirmation requise
          </h3>
        </div>

        {/* Modal Content */}
        <div className="mb-6">
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Êtes-vous sûr de vouloir vider tout le cache ?
          </p>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>⚠️ Attention :</strong> Cette action va supprimer :
            </p>
            <ul className="text-sm text-yellow-700 dark:text-yellow-300 mt-2 ml-4 list-disc space-y-1">
              <li>Tout le cache du navigateur (localStorage, sessionStorage, IndexedDB)</li>
              <li>Toutes les données en cache Redis</li>
            </ul>
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-3">
              Cette action est <strong>irréversible</strong> et la page se rechargera automatiquement.
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setShowConfirmModal(false)}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
          >
            Annuler
          </button>
          <button
            onClick={confirmClearCache}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors font-medium flex items-center gap-2"
          >
            <Trash2 size={18} />
            Vider le cache
          </button>
        </div>
      </div>
    </div>
  )
}