import { Activity } from 'lucide-react'
import { DiagnosticDuplicates } from '@/components/DiagnosticDuplicates'
import { CacheExplorer } from '@/components/CacheExplorer'

/**
 * Page de diagnostic pour détecter les problèmes de données
 *
 * Route: /diagnostic
 */
export default function Diagnostic() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Activity className="text-primary-600 dark:text-primary-400" size={32} />
          Diagnostic
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Outils de diagnostic pour identifier les problèmes de données
        </p>
      </div>

      <DiagnosticDuplicates />

      <CacheExplorer />
    </div>
  )
}
