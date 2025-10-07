import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import PermissionRoute from './components/PermissionRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import OAuthCallback from './pages/OAuthCallback'
import Settings from './pages/Settings'
import VerifyEmail from './pages/VerifyEmail'
import Admin from './pages/Admin'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Simulator from './pages/Simulator'
import Contribute from './pages/Contribute'
import AdminContributions from './pages/AdminContributions'
import AdminOffers from './pages/AdminOffers'
import AdminUsers from './pages/AdminUsers'
import AdminTempo from './pages/AdminTempo'
import AdminAddPDL from './pages/AdminAddPDL'
import AdminRoles from './pages/AdminRoles'
import Tempo from './pages/Tempo'
import FAQ from './pages/FAQ'
import NotFound from './pages/NotFound'
import Forbidden from './pages/Forbidden'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Chargement...</div>
      </div>
    )
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function App() {
  return (
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
              <Simulator />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contribute"
        element={
          <ProtectedRoute>
            <Layout>
              <Contribute />
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
            <PermissionRoute resource="tempo">
              <Layout>
                <AdminTempo />
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
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* Error pages */}
      <Route path="/forbidden" element={<Forbidden />} />
      <Route path="/404" element={<NotFound />} />

      {/* 404 - catch all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
