// Modale de confirmation avant perte de modifications

import { Send } from 'lucide-react'
import type { ConfirmDialogState } from '../../types'

interface ConfirmDialogProps {
  dialog: ConfirmDialogState
  onClose: () => void
}

export default function ConfirmDialog({ dialog, onClose }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4 text-orange-600 dark:text-orange-400">
            {dialog.title}
          </h2>
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line mb-6">
            {dialog.message}
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
            >
              Annuler
            </button>
            <button
              onClick={dialog.onSubmit}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg flex items-center gap-2"
            >
              <Send size={16} />
              Soumettre
            </button>
            <button
              onClick={dialog.onConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg"
            >
              Continuer sans soumettre
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
