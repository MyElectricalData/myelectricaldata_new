import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getPDLs, getStatus, triggerSync } from '../api/client'
import Card from '../components/Card'
import {
  Zap,
  MapPin,
  Sun,
  RefreshCw,
  ChevronRight,
  Clock,
  CheckCircle,
  Database,
  Calendar,
  TrendingUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useState } from 'react'

export default function Dashboard() {
  const [syncing, setSyncing] = useState(false)

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
    refetchInterval: 30000, // Refresh every 30s
  })

  const { data: allPdls, isLoading: pdlsLoading, refetch } = useQuery({
    queryKey: ['pdls'],
    queryFn: getPDLs,
  })

  // Filter only active PDLs
  const pdls = allPdls?.filter(pdl => pdl.is_active !== false)

  const handleSync = async () => {
    setSyncing(true)
    try {
      await triggerSync()
      toast.success('Synchronisation lancée')
      setTimeout(() => refetch(), 2000)
    } catch {
      toast.error('Erreur lors de la synchronisation')
    } finally {
      setSyncing(false)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Jamais'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor(diff / (1000 * 60))

    if (minutes < 60) return `il y a ${minutes} min`
    if (hours < 24) return `il y a ${hours}h`
    return date.toLocaleDateString('fr-FR')
  }

  const pdlCount = pdls?.length || 0

  return (
    <div className="space-y-6 pt-6">
      {/* Info Section - when no PDLs */}
      {!pdlsLoading && (!pdls || pdls.length === 0) && (
        <div className="card bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold mb-2">ℹ️ Configuration requise</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Vérifiez que vous avez bien configuré vos identifiants API dans le fichier de configuration</li>
            <li>Lancez une synchronisation pour récupérer vos PDL depuis la gateway</li>
            <li>Consultez la page "Exporteurs" pour configurer les intégrations (Home Assistant, MQTT, etc.)</li>
          </ol>
        </div>
      )}

      {/* PDL Management Card */}
      <div className="card">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Points de livraison</h2>
              {pdlCount > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  {pdlCount} point{pdlCount > 1 ? 's' : ''} de livraison configuré{pdlCount > 1 ? 's' : ''}
                </p>
              )}
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn btn-primary text-sm flex items-center justify-center gap-2 w-full sm:w-auto whitespace-nowrap"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              Synchroniser
            </button>
          </div>
        </div>

        {/* Loading state */}
        {pdlsLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse h-32 bg-gray-100 dark:bg-gray-700 rounded-lg" />
            ))}
          </div>
        ) : pdls && pdls.length > 0 ? (
          <div className="space-y-3">
            {pdls.map((pdl, index) => (
              <Link
                key={pdl.usage_point_id}
                to={`/consumption_kwh`}
                className="block animate-in fade-in slide-in-from-bottom-2"
                style={{
                  animationDelay: `${index * 50}ms`,
                  animationFillMode: 'backwards'
                }}
              >
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-2 border-gray-300 dark:border-gray-600 shadow-lg hover:shadow-xl hover:border-primary-400 dark:hover:border-primary-500 transition-all">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {pdl.name || `PDL ${pdl.usage_point_id}`}
                      </h4>
                      {pdl.has_production && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 text-xs rounded-full font-medium">
                          <Sun className="w-3 h-3" />
                          Production
                        </span>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>

                  {/* PDL number if name is set */}
                  {pdl.name && (
                    <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mb-2">
                      {pdl.usage_point_id}
                    </p>
                  )}

                  {/* Address */}
                  {pdl.address && (
                    <p className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-2">
                      <MapPin className="w-4 h-4 flex-shrink-0" />
                      {pdl.address}, {pdl.postal_code} {pdl.city}
                    </p>
                  )}

                  {/* Contract Info */}
                  <div className="flex flex-wrap gap-3 text-sm text-gray-500 dark:text-gray-400">
                    {pdl.subscribed_power && (
                      <span className="flex items-center gap-1">
                        <Zap className="w-4 h-4 text-blue-500" />
                        Puissance: {pdl.subscribed_power}
                      </span>
                    )}
                    {pdl.tariff_option && (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4 text-green-500" />
                        Tarif: {pdl.tariff_option}
                      </span>
                    )}
                    {pdl.contract_status && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4 text-purple-500" />
                        {pdl.contract_status}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Zap className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              Aucun point de livraison trouvé
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Lancez une synchronisation pour récupérer vos points de livraison
            </p>
          </div>
        )}
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {statusLoading ? '...' : status?.status === 'ok' ? 'En ligne' : 'Erreur'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Points de livraison</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {statusLoading ? '...' : status?.pdl_count || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
              <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Dernière sync</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {statusLoading ? '...' : formatDate(status?.last_sync)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
              <Database className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Database</p>
              <p className="font-semibold text-gray-900 dark:text-white capitalize">
                {statusLoading ? '...' : status?.database || 'SQLite'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Integrations status */}
      {status?.integrations && (
        <Card
          title="Intégrations"
          subtitle="État des exporteurs"
          icon={<CheckCircle className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Object.entries(status.integrations).map(([name, enabled]) => (
              <div
                key={name}
                className={`p-3 rounded-lg border ${
                  enabled
                    ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                    : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      enabled ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                    {name.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
