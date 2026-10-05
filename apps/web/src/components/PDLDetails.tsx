import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { enedisApi } from '@/api/enedis'
import { getAddressSummary, getContractSummary } from '@/utils/enedisMeasure'
import { X, Home, FileText, Loader2, Zap, TrendingUp, Battery, Sun, BarChart3 } from 'lucide-react'
import { highlightJson } from '@/utils/highlightJson'

interface PDLDetailsProps {
  usagePointId: string
  onClose: () => void
}

export default function PDLDetails({ usagePointId, onClose }: PDLDetailsProps) {
  const [useCache] = useState(true)
  const [testResult, setTestResult] = useState<any>(null)
  const [testError, setTestError] = useState<string | null>(null)

  // Fetch contract and address from API (works in both server and client mode)
  // In client mode, the backend proxies requests to MyElectricalData gateway
  const { data: contractData, isLoading: contractLoading } = useQuery({
    queryKey: ['contract', usagePointId],
    queryFn: () => enedisApi.getContract(usagePointId, useCache),
  })

  const { data: addressData, isLoading: addressLoading } = useQuery({
    queryKey: ['address', usagePointId],
    queryFn: () => enedisApi.getAddress(usagePointId, useCache),
  })

  // Test mutations
  const testConsumptionDaily = useMutation({
    mutationFn: async () => {
      const end = new Date().toISOString().split('T')[0]
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      return enedisApi.getConsumptionDaily(usagePointId, { start, end, use_cache: false })
    },
    onSuccess: (data) => setTestResult(data),
    onError: (error: any) => setTestError(error.message || 'Erreur lors de l\'appel'),
  })

  const testConsumptionDetail = useMutation({
    mutationFn: async () => {
      const end = new Date().toISOString().split('T')[0]
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      return enedisApi.getConsumptionDetail(usagePointId, { start, end, use_cache: false })
    },
    onSuccess: (data) => setTestResult(data),
    onError: (error: any) => setTestError(error.message || 'Erreur lors de l\'appel'),
  })

  const testMaxPower = useMutation({
    mutationFn: async () => {
      const end = new Date().toISOString().split('T')[0]
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      return enedisApi.getMaxPower(usagePointId, { start, end, use_cache: false })
    },
    onSuccess: (data) => setTestResult(data),
    onError: (error: any) => setTestError(error.message || 'Erreur lors de l\'appel'),
  })

  const testProductionDaily = useMutation({
    mutationFn: async () => {
      const end = new Date().toISOString().split('T')[0]
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      return enedisApi.getProductionDaily(usagePointId, { start, end, use_cache: false })
    },
    onSuccess: (data) => setTestResult(data),
    onError: (error: any) => setTestError(error.message || 'Erreur lors de l\'appel'),
  })

  const testProductionDetail = useMutation({
    mutationFn: async () => {
      const end = new Date().toISOString().split('T')[0]
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      return enedisApi.getProductionDetail(usagePointId, { start, end, use_cache: false })
    },
    onSuccess: (data) => setTestResult(data),
    onError: (error: any) => setTestError(error.message || 'Erreur lors de l\'appel'),
  })

  const isLoading = contractLoading || addressLoading
  const isTesting = testConsumptionDaily.isPending || testConsumptionDetail.isPending ||
                     testMaxPower.isPending || testProductionDaily.isPending || testProductionDetail.isPending

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50" style={{ zIndex: 9999 }}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Détails du Point de livraison</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* PDL ID */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              Point de livraison
            </h3>
            <p className="text-lg font-mono font-medium">{usagePointId}</p>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-primary-600" size={32} />
            </div>
          )}

          {!isLoading && (
            <>
              {/* Contract and Address Data */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {addressData?.success && addressData.data ? (
                  <div className="card">
                    <div className="flex items-center gap-2 mb-3">
                      <Home className="text-primary-600 dark:text-primary-400" size={20} />
                      <h3 className="font-semibold">Adresse</h3>
                    </div>
                    <div className="space-y-2 text-sm">
                    {(() => {
                      const address = getAddressSummary(addressData.data)

                      // Structure illisible : JSON brut
                      if (!address || !Object.values(address).some(Boolean)) {
                        return <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-auto max-h-64">{JSON.stringify(addressData.data, null, 2)}</pre>
                      }

                      return (
                        <>
                          {address.street && (
                            <div>
                              <span className="font-medium text-gray-500 dark:text-gray-400">Rue : </span>
                              <span>{address.street}</span>
                            </div>
                          )}
                          {address.postalCodeCity && (
                            <div>
                              <span className="font-medium text-gray-500 dark:text-gray-400">Code postal et ville : </span>
                              <span>{address.postalCodeCity}</span>
                            </div>
                          )}
                          {address.inseeCode && (
                            <div>
                              <span className="font-medium text-gray-500 dark:text-gray-400">Code INSEE : </span>
                              <span>{address.inseeCode}</span>
                            </div>
                          )}
                        </>
                      )
                    })()}
                    </div>
                  </div>
                ) : addressData && !addressData.success ? (
                  <div className="card bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                    <p className="text-red-800 dark:text-red-200 text-sm">
                      Erreur lors du chargement de l'adresse : {addressData?.error?.message}
                    </p>
                  </div>
                ) : null}

                {contractData?.success && contractData.data ? (
                  <div className="card">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="text-primary-600 dark:text-primary-400" size={20} />
                      <h3 className="font-semibold">Contrat</h3>
                    </div>
                    <div className="space-y-2 text-sm">
                    {(() => {
                      const contract = getContractSummary(contractData.data)

                      // Structure illisible : JSON brut
                      if (!contract || !Object.values(contract).some(Boolean)) {
                        return <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-auto max-h-64">{JSON.stringify(contractData.data, null, 2)}</pre>
                      }

                      return (
                        <>
                          {contract.segment && (
                            <div>
                              <span className="font-medium text-gray-500 dark:text-gray-400">Segment : </span>
                              <span>{contract.segment}</span>
                            </div>
                          )}
                          {contract.contractType && (
                            <div>
                              <span className="font-medium text-gray-500 dark:text-gray-400">Type : </span>
                              <span>{contract.contractType}</span>
                            </div>
                          )}
                          {contract.subscribedPower && (
                            <div>
                              <span className="font-medium text-gray-500 dark:text-gray-400">Puissance souscrite : </span>
                              <span>{contract.subscribedPower}</span>
                            </div>
                          )}
                          {contract.distributionTariff && (
                            <div>
                              <span className="font-medium text-gray-500 dark:text-gray-400">Tarif : </span>
                              <span>{contract.distributionTariff}</span>
                            </div>
                          )}
                          {contract.offpeakHours && (
                            <div>
                              <span className="font-medium text-gray-500 dark:text-gray-400">Heures creuses : </span>
                              <span>{contract.offpeakHours}</span>
                            </div>
                          )}
                          {contract.lastActivationDate && (
                            <div>
                              <span className="font-medium text-gray-500 dark:text-gray-400">Date d'activation : </span>
                              <span>{contract.lastActivationDate}</span>
                            </div>
                          )}
                        </>
                      )
                    })()}
                    </div>
                  </div>
                ) : contractData && !contractData.success ? (
                  <div className="card bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                    <p className="text-red-800 dark:text-red-200 text-sm">
                      Erreur lors du chargement du contrat : {contractData?.error?.message}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Test Section */}
              <div className="card bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="text-blue-600 dark:text-blue-400" size={20} />
                  <h3 className="font-semibold">Tester les endpoints</h3>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Consommation */}
                  <button
                    onClick={() => { setTestError(null); testConsumptionDaily.mutate(); }}
                    disabled={isTesting}
                    className="btn btn-secondary text-sm flex items-center gap-2 justify-start"
                  >
                    <Zap size={16} />
                    Journalière (30j)
                  </button>

                  <button
                    onClick={() => { setTestError(null); testConsumptionDetail.mutate(); }}
                    disabled={isTesting}
                    className="btn btn-secondary text-sm flex items-center gap-2 justify-start"
                  >
                    <TrendingUp size={16} />
                    Détaillée (7j)
                  </button>

                  {/* Production */}
                  <button
                    onClick={() => { setTestError(null); testProductionDaily.mutate(); }}
                    disabled={isTesting}
                    className="btn btn-secondary text-sm flex items-center gap-2 justify-start"
                  >
                    <Sun size={16} />
                    Production jour. (30j)
                  </button>

                  <button
                    onClick={() => { setTestError(null); testProductionDetail.mutate(); }}
                    disabled={isTesting}
                    className="btn btn-secondary text-sm flex items-center gap-2 justify-start"
                  >
                    <Sun size={16} />
                    Production dét. (7j)
                  </button>

                  {/* Puissance */}
                  <button
                    onClick={() => { setTestError(null); testMaxPower.mutate(); }}
                    disabled={isTesting}
                    className="btn btn-secondary text-sm flex items-center gap-2 justify-start col-span-2"
                  >
                    <Battery size={16} />
                    Puissance max (30j)
                  </button>
                </div>

                {/* Result Box - Always visible with fixed height */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold">Résultat :</h4>
                    {(testResult || testError) && (
                      <button
                        onClick={() => {
                          setTestResult(null)
                          setTestError(null)
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        Fermer
                      </button>
                    )}
                  </div>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded h-64 overflow-auto">
                    {isTesting ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3">
                        <Loader2 className="animate-spin text-blue-400" size={32} />
                        <span className="text-sm text-blue-400">Test en cours...</span>
                      </div>
                    ) : testError ? (
                      <div className="flex flex-col h-full">
                        <div className="text-red-400 font-semibold mb-2">Erreur :</div>
                        <div className="text-red-300 text-sm">{testError}</div>
                      </div>
                    ) : testResult ? (
                      <pre
                        className="text-xs leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: highlightJson(JSON.stringify(testResult, null, 2))
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                        Cliquez sur un bouton ci-dessus pour tester un endpoint
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4">
          <button onClick={onClose} className="btn btn-secondary w-full">
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
