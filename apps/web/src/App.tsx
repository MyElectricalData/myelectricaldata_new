import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { useAuth } from './hooks/useAuth'
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
import Admin from './pages/Admin'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Contribute from './pages/Contribute'
import AdminContributions from './pages/AdminContributions'
import AdminOffers from './pages/AdminOffers'
import AdminUsers from './pages/AdminUsers'
import AdminTempo from './pages/AdminTempo'
import AdminEcoWatt from './pages/AdminEcoWatt'
import AdminAddPDL from './pages/AdminAddPDL'
import AdminRoles from './pages/AdminRoles'
import AdminLogs from './pages/AdminLogs'
import Tempo from './pages/Tempo'
import EcoWatt from './pages/EcoWatt'
import ConsumptionKwh from './pages/ConsumptionKwh'
import ConsumptionEuro from './pages/ConsumptionEuro'
import Production from './pages/Production'
import Balance from './pages/Balance'
import FAQ from './pages/FAQ'
import Diagnostic from './pages/Diagnostic'
import ApiAuth from './pages/ApiAuth'
import NotFound from './pages/NotFound'
import Forbidden from './pages/Forbidden'

// Lazy load heavy pages (swagger-ui: ~1.3MB, jspdf: ~600KB)
const Simulator = lazy(() => import('./pages/Simulator'))
const ApiDocs = lazy(() => import('./pages/ApiDocs'))

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
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Chargement...</div>
      </div>
    )
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

function App() {
  return (
    <>
      <ToastContainer />
      <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
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
      <Route
        path="/contribute/new"
        element={
          <ProtectedRoute>
            <Layout>
              <Contribute initialTab="new" />
            </Layout>
          </ProtectedRoute>
        }
      />
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
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <PermissionRoute resource="admin_dashboard">
              <Layout>
                <Admin />
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

      {/* Error pages */}
      <Route path="/forbidden" element={<Forbidden />} />
      <Route path="/404" element={<NotFound />} />

      {/* 404 - catch all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  )
}

export default App
