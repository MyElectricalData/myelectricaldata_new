import { Link, useLocation } from 'react-router-dom'
import { usePermissions } from '@/hooks/usePermissions'
import { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Tab {
  name: string
  path: string
  permission?: string
}

const tabs: Tab[] = [
  { name: 'Tableau de bord', path: '/admin' },
  { name: 'Gestion des utilisateurs', path: '/admin/users', permission: 'users' },
  { name: 'Gestion Tempo', path: '/admin/tempo' },
  { name: 'Gestion EcoWatt', path: '/admin/ecowatt' },
  { name: 'Gestion des contributions', path: '/admin/contributions', permission: 'contributions' },
  { name: 'Gestion des offres', path: '/admin/offers', permission: 'offers' },
  { name: 'Gestion des rôles', path: '/admin/roles', permission: 'roles' },
  { name: 'Logs', path: '/admin/logs', permission: 'admin_dashboard' },
]

export default function AdminTabs() {
  const location = useLocation()
  const { hasPermission } = usePermissions()
  const navRef = useRef<HTMLElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const visibleTabs = tabs.filter(tab => !tab.permission || hasPermission(tab.permission))

  const checkScroll = () => {
    if (navRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = navRef.current
      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1)
    }
  }

  useEffect(() => {
    checkScroll()
    window.addEventListener('resize', checkScroll)
    return () => window.removeEventListener('resize', checkScroll)
  }, [])

  const scroll = (direction: 'left' | 'right') => {
    if (navRef.current) {
      const scrollAmount = 200
      navRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  return (
    <div className="w-full bg-white dark:bg-gray-800">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 max-w-[1920px]">
        <div className="border-b border-gray-200 dark:border-gray-700 relative">
          {canScrollLeft && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-0 top-0 bottom-0 z-10 px-2 bg-gradient-to-r from-white dark:from-gray-800 to-transparent flex items-center"
              aria-label="Défiler vers la gauche"
            >
              <ChevronLeft size={20} className="text-gray-500 dark:text-gray-400" />
            </button>
          )}
          <nav
            ref={navRef}
            onScroll={checkScroll}
            className="flex -mb-px overflow-x-auto scrollbar-hide"
            aria-label="Tabs"
          >
            {visibleTabs.map((tab) => {
              const isActive = location.pathname === tab.path
              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={`flex-1 text-center px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-w-fit ${
                    isActive
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  {tab.name}
                </Link>
              )
            })}
          </nav>
          {canScrollRight && (
            <button
              onClick={() => scroll('right')}
              className="absolute right-0 top-0 bottom-0 z-10 px-2 bg-gradient-to-l from-white dark:from-gray-800 to-transparent flex items-center"
              aria-label="Défiler vers la droite"
            >
              <ChevronRight size={20} className="text-gray-500 dark:text-gray-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
