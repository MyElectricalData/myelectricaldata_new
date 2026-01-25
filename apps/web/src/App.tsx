import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useAppMode, isClientMode as checkClientMode } from './hooks/useAppMode'
import { authApi } from './api/auth'

import Layout from './components/Layout'
import ToastContainer from './components/Toast'
import PermissionRoute from './components/PermissionRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import OAuthCallback from './pages/OAuthCallback'
import ConsentRedirect from './pages/ConsentRedirect'
import Settings from './pages/Settings'
import VerifyEmail from './pages/VerifyEmail'
import AdminDashboard from './pages/Admin/Dashboard'
import AdminUsers from './pages/Admin/Users'
import AdminRoles from './pages/Admin/Roles'
import AdminOffers from './pages/Admin/Offers'
import AdminContributions from './pages/Admin/Contributions'
import AdminTempo from './pages/Admin/Tempo'
import AdminEcoWatt from './pages/Admin/EcoWatt'
import AdminRTE from './pages/Admin/RTE'
import AdminLogs from './pages/Admin/Logs'
import AdminAddPDL from './pages/Admin/AddPDL'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Contribute from './pages/Contribute'
import Tempo from './pages/Tempo'
import EcoWatt from './pages/EcoWatt'
import France from './pages/France'
import ConsumptionKwh from './pages/ConsumptionKwh'
import ConsumptionEuro from './pages/ConsumptionEuro'
import Production from './pages/Production'
import Balance from './pages/Balance'
import FAQ from './pages/FAQ'
import Diagnostic from './pages/Diagnostic'
import ApiAuth from './pages/ApiAuth'
import NotFound from './pages/NotFound'
import Forbidden from './pages/Forbidden'

// Check client mode once at module load (before React renders)
const IS_CLIENT_MODE = checkClientMode()

// Lazy load heavy pages (swagger-ui: ~1.3MB, jspdf: ~600KB)
const Simulator = lazy(() => import('./pages/Simulator'))
const ApiDocs = lazy(() => import('./pages/ApiDocs'))

// Client mode export pages
const HomeAssistant = lazy(() => import('./pages/HomeAssistant'))
const MQTT = lazy(() => import('./pages/MQTT'))
const VictoriaMetrics = lazy(() => import('./pages/VictoriaMetrics'))

// Loading fallback for lazy-loaded pages
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const { isClientMode } = useAppMode()
  const location = useLocation()

  // Wait for auth to complete in both modes (ensures auto-login completes in client mode)
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Chargement...</div>
      </div>
    )
  }

  // In client mode, no authentication redirect needed - always render children
  if (isClientMode) {
    return <>{children}</>
  }

  if (!isAuthenticated) {
    // Sauvegarder l'URL courante (avec query params) pour y revenir après connexion
    const fullPath = location.pathname + location.search
    return <Navigate to="/login" state={{ from: fullPath }} replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

/**
 * Client Mode Initializer
 * In client mode, we need to auto-login before rendering any routes.
 * This ensures the auth cookie is set before any API requests are made.
 */
function ClientModeInitializer({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(!IS_CLIENT_MODE)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!IS_CLIENT_MODE) return

    const initialize = async () => {
      try {
        // Try to get current user first (cookie might already exist)
        const meResponse = await authApi.getMe()
        if (meResponse.success) {
          setIsInitialized(true)
          return
        }

        // No valid session, do auto-login
        const loginResponse = await authApi.autoLogin()
        if (!loginResponse.success) {
          setError('Échec de la connexion automatique')
          return
        }

        setIsInitialized(true)
      } catch (err) {
        console.error('[CLIENT_MODE] Initialization error:', err)
        setError('Erreur lors de l\'initialisation')
      }
    }

    initialize()
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-lg mb-2">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Initialisation...</div>
      </div>
    )
  }

  return <>{children}</>
}

function App() {
  const { isClientMode, isServerMode } = useAppMode()

  return (
    <ClientModeInitializer>
      <ToastContainer />
      <Routes>
      {/* Root route - depends on mode */}
      <Route path="/" element={isClientMode ? <Navigate to="/dashboard" replace /> : <Landing />} />

      {/* Server mode only: Auth routes */}
      {isServerMode && (
        <>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicRoute>
                <Signup />
              </PublicRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <PublicRoute>
                <ForgotPassword />
              </PublicRoute>
            }
          />
          <Route
            path="/reset-password"
            element={
              <PublicRoute>
                <ResetPassword />
              </PublicRoute>
            }
          />
        </>
      )}

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      {/* Server mode only: Settings page */}
      {isServerMode && (
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout>
                <Settings />
              </Layout>
            </ProtectedRoute>
          }
        />
      )}
      <Route
        path="/simulator"
        element={
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<PageLoader />}>
                <Simulator />
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/diagnostic"
        element={
          <ProtectedRoute>
            <Layout>
              <Diagnostic />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contribute"
        element={<Navigate to="/contribute/offers" replace />}
      />
      {/* Route désactivée temporairement - fonctionnalité intégrée dans /contribute/offers */}
      {/* <Route
        path="/contribute/new"
        element={
          <ProtectedRoute>
            <Layout>
              <Contribute initialTab="new" />
            </Layout>
          </ProtectedRoute>
        }
      /> */}
      <Route
        path="/contribute/mine"
        element={
          <ProtectedRoute>
            <Layout>
              <Contribute initialTab="mine" />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contribute/offers"
        element={
          <ProtectedRoute>
            <Layout>
              <Contribute initialTab="offers" />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/faq"
        element={
          <ProtectedRoute>
            <Layout>
              <FAQ />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/api-docs"
        element={
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<PageLoader />}>
                <ApiDocs />
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/api-docs/auth"
        element={
          <ProtectedRoute>
            <Layout>
              <ApiAuth />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tempo"
        element={
          <ProtectedRoute>
            <Layout>
              <Tempo />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/ecowatt"
        element={
          <ProtectedRoute>
            <Layout>
              <EcoWatt />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/france"
        element={
          <ProtectedRoute>
            <Layout>
              <France />
            </Layout>
          </ProtectedRoute>
        }
      />
      {/* Redirects for old routes */}
      <Route path="/consumption-france" element={<Navigate to="/france" replace />} />
      <Route path="/generation-forecast" element={<Navigate to="/france" replace />} />
      {/* Consumption routes with submenu */}
      <Route
        path="/consumption"
        element={<Navigate to="/consumption_kwh" replace />}
      />
      <Route
        path="/consumption_kwh"
        element={
          <ProtectedRoute>
            <Layout>
              <ConsumptionKwh />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/consumption_euro"
        element={
          <ProtectedRoute>
            <Layout>
              <ConsumptionEuro />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/production"
        element={
          <ProtectedRoute>
            <Layout>
              <Production />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/balance"
        element={
          <ProtectedRoute>
            <Layout>
              <Balance />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Client mode only: Export configuration pages */}
      {isClientMode && (
        <>
          <Route
            path="/home-assistant"
            element={
              <ProtectedRoute>
                <Layout>
                  <Suspense fallback={<PageLoader />}>
                    <HomeAssistant />
                  </Suspense>
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/mqtt"
            element={
              <ProtectedRoute>
                <Layout>
                  <Suspense fallback={<PageLoader />}>
                    <MQTT />
                  </Suspense>
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/victoriametrics"
            element={
              <ProtectedRoute>
                <Layout>
                  <Suspense fallback={<PageLoader />}>
                    <VictoriaMetrics />
                  </Suspense>
                </Layout>
              </ProtectedRoute>
            }
          />
          {/* Redirect old /export route to /home-assistant */}
          <Route path="/export" element={<Navigate to="/home-assistant" replace />} />
        </>
      )}

      {/* Server mode only: Admin routes */}
      {isServerMode && (
        <>
          <Route
            path="/admin"
        element={
          <ProtectedRoute>
            <PermissionRoute resource="admin_dashboard">
              <Layout>
                <AdminDashboard />
              </Layout>
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute>
            <PermissionRoute resource="users">
              <Layout>
                <AdminUsers />
              </Layout>
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/tempo"
        element={
          <ProtectedRoute>
            <Layout>
              <AdminTempo />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/ecowatt"
        element={
          <ProtectedRoute>
            <PermissionRoute resource="admin_dashboard">
              <Layout>
                <AdminEcoWatt />
              </Layout>
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/rte"
        element={
          <ProtectedRoute>
            <PermissionRoute resource="admin_dashboard">
              <Layout>
                <AdminRTE />
              </Layout>
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/contributions"
        element={
          <ProtectedRoute>
            <PermissionRoute resource="contributions">
              <Layout>
                <AdminContributions />
              </Layout>
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/offers"
        element={
          <ProtectedRoute>
            <PermissionRoute resource="offers">
              <Layout>
                <AdminOffers />
              </Layout>
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/roles"
        element={
          <ProtectedRoute>
            <PermissionRoute resource="roles">
              <Layout>
                <AdminRoles />
              </Layout>
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/logs"
        element={
          <ProtectedRoute>
            <PermissionRoute resource="admin_dashboard">
              <Layout>
                <AdminLogs />
              </Layout>
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
          <Route
            path="/admin/add-pdl"
            element={
              <ProtectedRoute>
                <PermissionRoute resource="users">
                  <Layout>
                    <AdminAddPDL />
                  </Layout>
                </PermissionRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/oauth/callback"
            element={
              <ProtectedRoute>
                <OAuthCallback />
              </ProtectedRoute>
            }
          />
          {/* Route for Enedis consent redirect - forwards to backend */}
          <Route path="/consent" element={<ConsentRedirect />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
        </>
      )}

      {/* Shared: Error pages */}
      <Route path="/forbidden" element={<Forbidden />} />
      <Route path="/404" element={<NotFound />} />

      {/* 404 - catch all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </ClientModeInitializer>
  )
}

export default App
