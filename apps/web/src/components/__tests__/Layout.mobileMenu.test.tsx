import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import Layout from '../Layout'
import { useAppMode } from '@/hooks/useAppMode'

// Constante injectée par le `define` de vite.config.ts, absente de vitest.config.ts
vi.stubGlobal('__APP_VERSION__', 'test')
// jsdom n'implémente pas scrollTo (appelé au changement de page)
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo

vi.mock('@/hooks/useAppMode', () => ({ useAppMode: vi.fn() }))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '1', email: 'test@example.com' }, logout: vi.fn() }),
}))
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: () => false,
    hasAction: () => false,
    canAccessAdmin: () => false,
    isAdmin: () => false,
    isModerator: () => false,
    isVisitor: () => false,
  }),
}))
vi.mock('@/api/energy', () => ({
  energyApi: {
    getUnreadContributionsCount: vi.fn().mockResolvedValue({ success: true, data: { unread_count: 0 } }),
    getContributionStats: vi.fn().mockResolvedValue({ success: true, data: {} }),
  },
}))
vi.mock('@/api/admin', () => ({
  adminApi: {
    clearAllConsumptionCache: vi.fn(),
    getAllSharedPdls: vi.fn().mockResolvedValue({ success: true, data: [] }),
  },
}))
vi.mock('@/api/pdl', () => ({ pdlApi: { list: vi.fn().mockResolvedValue({ success: true, data: [] }) } }))
vi.mock('@/api/info', () => ({ infoApi: { getInfo: vi.fn().mockResolvedValue({}) } }))

/** Navigation déclenchée hors du menu (équivalent du retour arrière du navigateur). */
function NavigateButton({ to }: { to: string }) {
  const navigate = useNavigate()
  return <button onClick={() => navigate(to)}>aller {to}</button>
}

const renderLayout = () => {
  vi.mocked(useAppMode).mockReturnValue({ mode: 'client', isClientMode: true, isServerMode: false })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Layout>
            <NavigateButton to="/consumption" />
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  )
}

/** Le menu mobile est toujours monté : seul `translate-x-*` dit s'il est ouvert. */
const mobileMenu = () => document.querySelector('aside[class*="md:hidden"]') as HTMLElement
const isMenuOpen = () => mobileMenu().className.includes('translate-x-0')
const toggleMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Menu' }))

/**
 * PR #124 (MED-99) : menu mobile déroulant et défilement d'arrière-plan verrouillé.
 * jsdom ne calcule aucune mise en page : le défilement réel du menu en viewport bas
 * se prouve au navigateur, ici on fixe le contrat du verrou et de la fermeture.
 */
describe('Layout : menu mobile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.style.overflow = ''
  })

  it('menu fermé : le défilement de la page n\'est pas verrouillé', () => {
    renderLayout()

    expect(isMenuOpen()).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('ouverture : verrouille le défilement de la page, fermeture : le rend', () => {
    renderLayout()

    toggleMenu()
    expect(isMenuOpen()).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')

    toggleMenu()
    expect(isMenuOpen()).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('fermeture par l\'overlay : restaure la valeur d\'overflow d\'avant l\'ouverture', () => {
    document.body.style.overflow = 'scroll'
    renderLayout()

    toggleMenu()
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(document.querySelector('div.fixed.inset-0.bg-black\\/50') as HTMLElement)
    expect(isMenuOpen()).toBe(false)
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('changement de route hors du menu (retour arrière) : ferme le menu et libère la page', () => {
    renderLayout()

    toggleMenu()
    expect(isMenuOpen()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'aller /consumption' }))

    expect(isMenuOpen()).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('démontage menu ouvert : la page n\'est pas laissée verrouillée', () => {
    const { unmount } = renderLayout()

    toggleMenu()
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('structure : barre de navigation défilante bornée, actions du bas plafonnées', () => {
    renderLayout()

    const aside = mobileMenu()
    expect(aside).toHaveClass('flex', 'flex-col')

    // min-h-0 : sans lui, un enfant flex ne rétrécit pas sous son contenu et ne défile jamais
    const nav = aside.querySelector('nav') as HTMLElement
    expect(nav).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto', 'overscroll-contain')

    // Les actions du bas ne doivent pas écraser la navigation sur un écran bas
    const bottom = nav.nextElementSibling as HTMLElement
    expect(bottom).toHaveClass('flex-shrink-0', 'max-h-[50vh]', 'overflow-y-auto')
  })
})
