import { Link } from 'react-router-dom'
import { ArrowRight, Shield, Zap, Key, Moon, Sun, Heart, Lock, Database, BarChart3, RefreshCw, ChevronDown, Sparkles, TrendingUp, Github, Server, Home, Radio, LineChart, Container } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useThemeStore } from '@/stores/themeStore'
import { useState, useEffect, useRef } from 'react'

// Hook pour détecter si un élément est visible
function useInView(options = {}) {
  const [isInView, setIsInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true)
      }
    }, options)

    observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return [ref, isInView] as const
}

// Composant compteur animé
function AnimatedCounter({ end, duration = 2000, suffix = '' }: { end: number; duration?: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const [ref, isInView] = useInView()

  useEffect(() => {
    if (!isInView) return

    let startTime: number | null = null
    const animate = (currentTime: number) => {
      if (startTime === null) startTime = currentTime
      const progress = Math.min((currentTime - startTime) / duration, 1)
      setCount(Math.floor(progress * end))
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }, [isInView, end, duration])

  return (
    <div ref={ref}>
      <span className="text-4xl sm:text-5xl font-bold text-primary-600 dark:text-primary-400">
        {count}{suffix}
      </span>
    </div>
  )
}

// Composant Canvas pour particules connectées
function ConnectedParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showHearts, setShowHearts] = useState(false)

  // Konami Code detector (compatible QWERTY et AZERTY)
  useEffect(() => {
    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', ['KeyA', 'KeyQ']] // A sur QWERTY, Q sur AZERTY
    let konamiIndex = 0

    const handleKeyDown = (e: KeyboardEvent) => {
      const expectedKey = konamiCode[konamiIndex]

      // Vérifier si la touche correspond (peut être un string ou un array de strings)
      const isMatch = Array.isArray(expectedKey)
        ? expectedKey.includes(e.code)
        : e.code === expectedKey

      if (isMatch) {
        konamiIndex++
        if (konamiIndex === konamiCode.length) {
          setShowHearts(prev => !prev)
          konamiIndex = 0
        }
      } else {
        konamiIndex = 0
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Définir la taille du canvas
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Créer les particules
    const particles: Array<{
      x: number
      y: number
      vx: number
      vy: number
      radius: number
      isKiss?: boolean
    }> = []

    const particleCount = 60
    const maxDistance = 150

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 3 + 3,
        isKiss: Math.random() > 0.7 // 30% de chance d'être un bisou
      })
    }

    // Animation
    let animationId: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Mettre à jour et dessiner les particules
      particles.forEach((particle, i) => {
        // Déplacer la particule
        particle.x += particle.vx
        particle.y += particle.vy

        // Rebondir sur les bords
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1

        // Dessiner la particule, le cœur ou le bisou
        if (showHearts) {
          if (particle.isKiss) {
            // Dessiner un bisou emoji 💋
            ctx.save()
            ctx.translate(particle.x, particle.y)
            ctx.font = `${particle.radius * 8}px Arial`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('💋', 0, 0)
            ctx.restore()
          } else {
            // Dessiner un GROS cœur
            ctx.save()
            ctx.translate(particle.x, particle.y)
            const size = particle.radius * 8
            ctx.beginPath()
            ctx.moveTo(0, size / 4)
            ctx.bezierCurveTo(-size / 2, -size / 4, -size, size / 3, 0, size)
            ctx.bezierCurveTo(size, size / 3, size / 2, -size / 4, 0, size / 4)
            ctx.fillStyle = 'rgba(236, 72, 153, 0.8)'
            ctx.fill()
            ctx.restore()
          }
        } else {
          // Dessiner la particule normale
          ctx.beginPath()
          ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(59, 130, 246, 0.6)'
          ctx.fill()
        }

        // Connecter aux particules proches
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[j].x - particle.x
          const dy = particles[j].y - particle.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < maxDistance) {
            ctx.beginPath()
            ctx.moveTo(particle.x, particle.y)
            ctx.lineTo(particles[j].x, particles[j].y)
            const opacity = (1 - distance / maxDistance) * 0.3
            if (showHearts) {
              ctx.strokeStyle = `rgba(236, 72, 153, ${opacity})`
            } else {
              ctx.strokeStyle = `rgba(59, 130, 246, ${opacity})`
            }
            ctx.lineWidth = 2.5
            ctx.stroke()
          }
        }
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      cancelAnimationFrame(animationId)
    }
  }, [showHearts])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.4 }}
    />
  )
}

// Fonction pour smooth scroll
function scrollToNextSection() {
  window.scrollTo({
    top: window.innerHeight,
    behavior: 'smooth'
  })
}

export default function LandingV2() {
  const { isAuthenticated } = useAuth()
  const { isDark, toggleTheme } = useThemeStore()
  const [showHeader, setShowHeader] = useState(false)

  // Animation du texte hero
  const [heroText, setHeroText] = useState('')
  const fullText = 'Accédez à vos données Linky'

  useEffect(() => {
    let index = 0
    const interval = setInterval(() => {
      if (index <= fullText.length) {
        setHeroText(fullText.slice(0, index))
        index++
      } else {
        clearInterval(interval)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [])

  // Parallax effect, smooth scroll global et header qui apparaît au scroll
  useEffect(() => {
    // Smooth scroll global
    document.documentElement.style.scrollBehavior = 'smooth'

    const handleScroll = () => {
      // Afficher le header après 100px de scroll
      setShowHeader(window.scrollY > 100)
    }

    window.addEventListener('scroll', handleScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      document.documentElement.style.scrollBehavior = 'auto'
    }
  }, [])

  const [ref1, isInView1] = useInView({ threshold: 0.1 })
  const [ref2, isInView2] = useInView({ threshold: 0.1 })
  const [ref3, isInView3] = useInView({ threshold: 0.1 })
  const [ref4, isInView4] = useInView({ threshold: 0.1 })
  const [ref5, isInView5] = useInView({ threshold: 0.1 })

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Header avec effet glassmorphism - Caché en haut, visible au scroll */}
      <header className={`fixed left-0 right-0 z-50 backdrop-blur-md bg-white/80 dark:bg-gray-800/80 border-b border-gray-300 dark:border-gray-700 shadow-sm transition-all duration-500 ${
        showHeader ? 'top-0 opacity-100' : '-top-20 opacity-0'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center justify-center group">
              <img
                src="/logo-full.png"
                alt="MyElectricalData - Vos données Linky chez vous"
                className="h-10 w-auto hidden sm:block transition-transform duration-300 group-hover:scale-105"
              />
              <img
                src="/logo.svg"
                alt="MyElectricalData"
                className="h-8 w-8 sm:hidden transition-transform duration-300 group-hover:rotate-12"
              />
            </Link>

            <nav className="flex items-center space-x-2 sm:space-x-4">
              <a
                href="https://github.com/MyElectricalData/myelectricaldata_new"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 px-2 sm:px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-300 hover:scale-105"
                title="Voir le code source sur GitHub"
              >
                <Github size={18} />
                <span className="hidden lg:inline">GitHub</span>
              </a>
              <a
                href="https://www.paypal.com/donate/?business=FY25JLXDYLXAJ&no_recurring=0&currency_code=EUR"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 px-2 sm:px-3 py-2 rounded-md bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-900/30 transition-all duration-300 hover:scale-105"
                title="Faire un don"
              >
                <Heart size={18} className="animate-pulse" />
                <span className="hidden lg:inline">Donation</span>
              </a>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300 hover:rotate-180"
                aria-label="Toggle theme"
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              {!isAuthenticated && (
                <Link to="/login" className="btn btn-secondary text-sm sm:text-base px-3 sm:px-4 hover:scale-105 transition-transform duration-300">
                  <span className="hidden sm:inline">Se connecter</span>
                  <span className="sm:hidden">Connexion</span>
                </Link>
              )}
              {isAuthenticated && (
                <Link to="/dashboard" className="btn btn-primary text-sm sm:text-base px-3 sm:px-4 hover:scale-105 transition-transform duration-300">
                  Dashboard
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section avec particules et gradient animé */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-800">
        {/* Particules connectées */}
        <ConnectedParticles />

        {/* Cercles décoratifs animés */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary-300/10 dark:bg-primary-600/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-300/10 dark:bg-blue-600/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mb-6 animate-bounce-subtle">
              <Sparkles size={16} />
              <span className="text-sm font-medium">100% Gratuit & Open Source</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-gray-900 dark:text-white mb-6 min-h-[80px] sm:min-h-[100px] lg:min-h-[140px]">
              {heroText}
              <span className="animate-blink">|</span>
            </h1>

            <p className="text-lg sm:text-xl lg:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed animate-fade-in" style={{ animationDelay: '0.5s' }}>
              <span className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 bg-clip-text text-transparent font-bold">MyElectricalData</span> est une <span className="text-primary-600 dark:text-primary-400 font-semibold">passerelle intelligente</span> qui permet à n'importe quel particulier d'accéder à ses données de consommation/production d'électricité disponibles chez Enedis.
            </p>

            {isAuthenticated ? (
              <div className="flex justify-center animate-fade-in" style={{ animationDelay: '1s' }}>
                <Link
                  to="/dashboard"
                  className="group btn btn-primary text-lg px-8 py-4 inline-flex items-center gap-2 hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  Accéder au dashboard
                  <ArrowRight className="group-hover:translate-x-1 transition-transform duration-300" size={20} />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row justify-center gap-4 animate-fade-in" style={{ animationDelay: '1s' }}>
                <Link
                  to="/signup"
                  className="group btn btn-primary text-lg px-8 py-4 inline-flex items-center justify-center gap-2 hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  Démarrer gratuitement
                  <ArrowRight className="group-hover:translate-x-1 transition-transform duration-300" size={20} />
                </Link>
                <Link
                  to="/login"
                  className="btn btn-secondary text-lg px-8 py-4 hover:scale-105 transition-all duration-300"
                >
                  Se connecter
                </Link>
              </div>
            )}
          </div>

        </div>

        {/* Scroll indicator - EN BAS DE LA SECTION, bien centré */}
        <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-2 z-20">
          <p className="text-white dark:text-gray-300 text-sm font-medium animate-pulse">
            Découvrez plus bas
          </p>
          <button
            onClick={scrollToNextSection}
            className="animate-bounce cursor-pointer hover:scale-110 transition-transform duration-300 focus:outline-none"
            aria-label="Défiler vers le bas"
          >
            <ChevronDown className="text-white dark:text-gray-300" size={40} />
          </button>
        </div>
      </section>

      {/* Stats Section avec compteurs animés */}
      <section className="py-12 bg-gradient-to-b from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="p-6 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 transform hover:scale-105">
              <TrendingUp className="w-12 h-12 mx-auto mb-4 text-primary-600 dark:text-primary-400" />
              <AnimatedCounter end={99} suffix="%" />
              <p className="text-gray-600 dark:text-gray-400 mt-2">Disponibilité</p>
            </div>
            <div className="p-6 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 transform hover:scale-105">
              <Shield className="w-12 h-12 mx-auto mb-4 text-primary-600 dark:text-primary-400" />
              <AnimatedCounter end={100} suffix="%" />
              <p className="text-gray-600 dark:text-gray-400 mt-2">Sécurisé</p>
            </div>
            <div className="p-6 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 transform hover:scale-105">
              <Zap className="w-12 h-12 mx-auto mb-4 text-primary-600 dark:text-primary-400" />
              <AnimatedCounter end={5} suffix="/s" />
              <p className="text-gray-600 dark:text-gray-400 mt-2">Requêtes max</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pourquoi utiliser MyElectricalData */}
      <section
        ref={ref1}
        className={`bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 py-12 transition-all duration-700 ${
          isInView1 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-8 text-gray-900 dark:text-white">
            Pourquoi utiliser <span className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 bg-clip-text text-transparent">MyElectricalData</span> ?
          </h2>
          <div className="space-y-6 text-lg text-gray-600 dark:text-gray-400">
            <div className="p-6 bg-white dark:bg-gray-900 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <p>
                Depuis le renforcement du système d'authentification de la société Enedis (passage à l'OAuth2.0), il n'est plus possible pour les particuliers d'accéder à leurs données de façon automatique (via API).
              </p>
            </div>
            <div className="p-6 bg-white dark:bg-gray-900 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <p>
                C'est pour cela que j'ai décidé de créer une passerelle qui va vous permettre de faire "passe-plat" entre vous et Enedis et qui prendra en charge toutes les différentes couches de sécurité.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comment ça marche - Timeline interactive */}
      <section
        ref={ref2}
        className={`bg-gradient-to-b from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 py-12 transition-all duration-700 ${
          isInView2 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16 text-gray-900 dark:text-white">
            Comment ça marche ?
          </h2>

          <div className="relative">
            {/* Timeline line */}
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary-200 via-primary-500 to-primary-200 dark:from-primary-800 dark:via-primary-500 dark:to-primary-800" />

            <div className="space-y-12 md:space-y-16">
              {/* Étape 1 */}
              <div className="relative flex flex-col md:flex-row items-center gap-6 md:gap-8">
                {/* Mobile: numéro en haut, Desktop: carte à gauche */}
                <div className="md:hidden relative flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white font-bold text-xl shadow-lg z-10 animate-pulse">
                  1
                </div>
                <div className="flex-1 w-full md:w-auto text-center md:text-right">
                  <div className="inline-block p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white flex items-center justify-center md:justify-end gap-2">
                      <Key className="text-primary-600 dark:text-primary-400" size={28} />
                      Création de compte
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-lg">
                      Créez votre compte et obtenez vos identifiants API (client_id et client_secret).
                    </p>
                  </div>
                </div>
                {/* Desktop: numéro au centre */}
                <div className="hidden md:flex relative items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white font-bold text-xl shadow-lg z-10 animate-pulse">
                  1
                </div>
                <div className="hidden md:block flex-1" />
              </div>

              {/* Étape 2 */}
              <div className="relative flex flex-col md:flex-row items-center gap-6 md:gap-8">
                {/* Mobile: numéro en haut */}
                <div className="md:hidden relative flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white font-bold text-xl shadow-lg z-10 animate-pulse" style={{ animationDelay: '0.3s' }}>
                  2
                </div>
                {/* Desktop: espace à gauche */}
                <div className="hidden md:block flex-1" />
                {/* Desktop: numéro au centre */}
                <div className="hidden md:flex relative items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white font-bold text-xl shadow-lg z-10 animate-pulse" style={{ animationDelay: '0.3s' }}>
                  2
                </div>
                <div className="flex-1 w-full md:w-auto text-center md:text-left">
                  <div className="inline-block p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white flex items-center justify-center md:justify-start gap-2">
                      <Shield className="text-primary-600 dark:text-primary-400" size={28} />
                      Consentement Enedis
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-lg">
                      Autorisez la passerelle à accéder à vos données via le portail officiel Enedis.
                    </p>
                  </div>
                </div>
              </div>

              {/* Étape 3 */}
              <div className="relative flex flex-col md:flex-row items-center gap-6 md:gap-8">
                {/* Mobile: numéro en haut */}
                <div className="md:hidden relative flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white font-bold text-xl shadow-lg z-10 animate-pulse" style={{ animationDelay: '0.6s' }}>
                  3
                </div>
                <div className="flex-1 w-full md:w-auto text-center md:text-right">
                  <div className="inline-block p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white flex items-center justify-center md:justify-end gap-2">
                      <Zap className="text-primary-600 dark:text-primary-400" size={28} />
                      Accès aux données
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-lg">
                      Utilisez notre API pour récupérer vos consommations, productions et données contractuelles.
                    </p>
                  </div>
                </div>
                {/* Desktop: numéro au centre */}
                <div className="hidden md:flex relative items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white font-bold text-xl shadow-lg z-10 animate-pulse" style={{ animationDelay: '0.6s' }}>
                  3
                </div>
                <div className="hidden md:block flex-1" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fonctionnalités avec cards glassmorphism */}
      <section
        ref={ref3}
        className={`bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 py-12 transition-all duration-700 ${
          isInView3 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12 text-gray-900 dark:text-white">
            Fonctionnalités
          </h2>
          <div className="grid sm:grid-cols-2 gap-8 sm:[&>*:nth-child(5)]:col-start-1 sm:[&>*:nth-child(5)]:col-span-2 sm:[&>*:nth-child(5)]:max-w-xl sm:[&>*:nth-child(5)]:mx-auto sm:[&>*:nth-child(5)]:w-full">
            {[
              { icon: Lock, title: 'Sécurité maximale', desc: 'Données chiffrées avec votre clé API personnelle. Impossible d\'y accéder sans vos identifiants.', delay: '0s' },
              { icon: Zap, title: 'Cache intelligent', desc: 'Système de cache pour respecter les quotas Enedis (5 requêtes/seconde) et améliorer les performances.', delay: '0.1s' },
              { icon: BarChart3, title: 'Données complètes', desc: 'Accédez à toutes vos données : consommation, production, puissance maximale, contrat, adresse, etc.', delay: '0.2s' },
              { icon: RefreshCw, title: 'Gestion OAuth2.0', desc: 'Prise en charge complète de l\'authentification OAuth2.0 d\'Enedis et gestion automatique des tokens.', delay: '0.3s' },
              { icon: Container, title: 'Déploiement simplifié', desc: 'Déployable facilement avec Docker et Helm Chart pour Kubernetes. Infrastructure as Code pour une mise en production rapide.', delay: '0.4s' }
            ].map((feature, idx) => (
              <div
                key={idx}
                className="group relative p-8 bg-white dark:bg-gray-900 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 border border-gray-200 dark:border-gray-700 overflow-hidden"
                style={{ animationDelay: feature.delay }}
              >
                {/* Effet de brillance au hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 translate-x-[-100%] group-hover:translate-x-[100%]" style={{ transition: 'transform 1s' }} />

                <div className="relative z-10">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 mb-4 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                    <feature.icon className="text-primary-600 dark:text-primary-400" size={32} />
                  </div>
                  <h3 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-300">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Données personnelles avec FAQ style */}
      <section
        ref={ref4}
        className={`bg-gradient-to-b from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 py-12 transition-all duration-700 ${
          isInView4 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12 text-gray-900 dark:text-white">
            Vos données sont protégées
          </h2>
          <div className="space-y-6">
            <div className="p-8 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-lg border border-blue-200 dark:border-blue-800 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-start gap-4">
                <Database className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" size={32} />
                <div>
                  <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Système de cache multi-niveaux</h3>
                  <p className="text-gray-700 dark:text-gray-300 text-lg leading-relaxed mb-4">
                    Les API d'Enedis sont limitées à <strong>5 appels par seconde</strong>. Pour pallier ces limitations, plusieurs niveaux de cache ont été mis en place :
                  </p>
                  <ul className="space-y-3 text-gray-700 dark:text-gray-300 text-base">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                      <span><strong>Cache passerelle</strong> : vos données sont stockées de manière chiffrée sur la passerelle avec une durée de vie de <strong>24h</strong>. Ce cache permet jusqu'à <strong className="text-blue-600 dark:text-blue-400">500 appels/jour</strong> (obligatoire pour l'utilisation de l'interface web).</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                      <span><strong>Cache navigateur</strong> : lors de votre navigation sur l'interface web, les données sont temporairement stockées dans le cache de votre navigateur pour fluidifier l'expérience.</span>
                    </li>
                  </ul>
                  <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded">
                    <p className="text-gray-700 dark:text-gray-300 text-sm">
                      <strong className="text-amber-700 dark:text-amber-400">Note importante :</strong> Le cache passerelle est <strong>obligatoire</strong> dès que vous utilisez l'interface web (bouton "Récupérer les données chez Enedis").
                      Si vous utilisez uniquement le client auto-hébergé sans cache passerelle, vous êtes limité à <strong className="text-amber-700 dark:text-amber-400">50 appels/jour</strong> au lieu de 500.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 bg-gradient-to-br from-green-50 to-teal-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-lg border border-green-200 dark:border-green-800 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-start gap-4">
                <Lock className="text-green-600 dark:text-green-400 flex-shrink-0 mt-1" size={32} />
                <div>
                  <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Chiffrement end-to-end</h3>
                  <p className="text-gray-700 dark:text-gray-300 text-lg leading-relaxed">
                    Vos données sont chiffrées avec votre clé API personnelle. Même l'administrateur du système ne peut pas y accéder sans vos identifiants.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section Client Auto-hébergé et Intégrations */}
      <section
        ref={ref5}
        className={`bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 py-12 transition-all duration-700 ${
          isInView5 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mb-6">
              <Server size={16} />
              <span className="text-sm font-medium">Auto-hébergement</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-6 text-gray-900 dark:text-white">
              Déployez votre propre <span className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 bg-clip-text text-transparent">client</span>
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
              Installez le client <span className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 bg-clip-text text-transparent font-semibold">MyElectricalData</span> chez vous pour synchroniser automatiquement vos données avec vos outils préférés
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {/* Home Assistant */}
            <div className="group p-8 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-lg border border-blue-200 dark:border-blue-800 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-blue-500 dark:bg-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Home className="text-white" size={32} />
                </div>
                <h3 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white">Home Assistant</h3>
                <p className="text-gray-700 dark:text-gray-300 text-lg leading-relaxed">
                  Intégration native pour afficher vos consommations dans vos tableaux de bord domotique
                </p>
              </div>
            </div>

            {/* MQTT */}
            <div className="group p-8 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-lg border border-purple-200 dark:border-purple-800 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-purple-500 dark:bg-purple-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Radio className="text-white" size={32} />
                </div>
                <h3 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white">MQTT</h3>
                <p className="text-gray-700 dark:text-gray-300 text-lg leading-relaxed">
                  Protocole <strong>universel</strong> permettant d'exporter vos données vers <strong>n'importe quelle solution domotique</strong> (Jeedom, Domoticz, OpenHAB, etc.)
                </p>
              </div>
            </div>

            {/* InfluxDB */}
            <div className="group p-8 bg-gradient-to-br from-orange-50 to-red-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-lg border border-orange-200 dark:border-orange-800 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-orange-500 dark:bg-orange-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <LineChart className="text-white" size={32} />
                </div>
                <h3 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white">InfluxDB</h3>
                <p className="text-gray-700 dark:text-gray-300 text-lg leading-relaxed">
                  Stockez vos métriques dans votre base de données pour des analyses avancées avec Grafana
                </p>
              </div>
            </div>
          </div>

          {/* Avantages du client auto-hébergé */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700">
            <h3 className="text-2xl font-bold mb-6 text-center text-gray-900 dark:text-white">
              Pourquoi utiliser le client auto-hébergé ?
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-500 dark:bg-green-600 rounded-full flex items-center justify-center mt-1">
                  <span className="text-white text-sm font-bold">✓</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Synchronisation automatique</h4>
                  <p className="text-gray-600 dark:text-gray-400">Récupération quotidienne de vos nouvelles données sans intervention</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-500 dark:bg-green-600 rounded-full flex items-center justify-center mt-1">
                  <span className="text-white text-sm font-bold">✓</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Contrôle total</h4>
                  <p className="text-gray-600 dark:text-gray-400">Vos données restent chez vous, sur votre infrastructure</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-500 dark:bg-green-600 rounded-full flex items-center justify-center mt-1">
                  <span className="text-white text-sm font-bold">✓</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Docker & Kubernetes</h4>
                  <p className="text-gray-600 dark:text-gray-400">Déploiement avec Docker/Docker Compose ou Helm Chart pour Kubernetes</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-500 dark:bg-green-600 rounded-full flex items-center justify-center mt-1">
                  <span className="text-white text-sm font-bold">✓</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Configuration flexible</h4>
                  <p className="text-gray-600 dark:text-gray-400">Choisissez les intégrations qui vous conviennent</p>
                </div>
              </div>
            </div>
            <div className="mt-8 text-center">
              <a
                href="https://github.com/MyElectricalData/myelectricaldata_new"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-all duration-300 hover:scale-105"
              >
                <Github size={20} />
                Voir la documentation sur GitHub
              </a>
            </div>
          </div>

          {/* Note importante */}
          <div className="mt-12 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-8 border border-amber-200 dark:border-amber-700">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0">
                <Shield className="text-amber-600 dark:text-amber-400" size={32} />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white">
                  Note importante
                </h3>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-amber-500 dark:bg-amber-600 rounded-full flex items-center justify-center mt-1">
                <span className="text-white text-sm font-bold">ℹ</span>
              </div>
              <div>
                <p className="text-gray-800 dark:text-gray-200 text-lg leading-relaxed">
                  Le client auto-hébergé <strong>n'inclut pas</strong> la partie passerelle Enedis, car celle-ci nécessite la signature d'un contrat professionnel avec Enedis (réservé aux entreprises et associations).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 mt-4">
              <div className="flex-shrink-0 w-6 h-6 bg-green-500 dark:bg-green-600 rounded-full flex items-center justify-center mt-1">
                <span className="text-white text-sm font-bold">✓</span>
              </div>
              <div>
                <p className="text-gray-800 dark:text-gray-200 text-lg leading-relaxed">
                  Le client se connecte à cette passerelle en ligne via vos identifiants API personnels.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 mt-4">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-500 dark:bg-blue-600 rounded-full flex items-center justify-center mt-1">
                <span className="text-white text-sm font-bold">🔓</span>
              </div>
              <div>
                <p className="text-gray-800 dark:text-gray-200 text-lg leading-relaxed">
                  Le code source complet de la passerelle est disponible en{' '}
                  <a
                    href="https://github.com/MyElectricalData/myelectricaldata_new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline hover:no-underline transition-colors duration-200"
                  >
                    open source sur GitHub
                  </a>{' '}
                  pour consultation et audit de sécurité.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section Soutenez le projet */}
      <section className="bg-gradient-to-b from-white to-pink-50 dark:from-gray-800 dark:to-pink-900/10 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 rounded-2xl p-8 md:p-12 border-2 border-pink-200 dark:border-pink-800 shadow-xl">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-400 mb-4">
                <Heart size={20} className="animate-pulse" />
                <span className="text-sm font-medium">Soutenez le projet</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
                Aidez-nous à maintenir la passerelle
              </h2>
            </div>

            <div className="space-y-6 mb-8">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-green-500 dark:bg-green-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">✓</span>
                </div>
                <div>
                  <p className="text-gray-800 dark:text-gray-200 text-lg leading-relaxed">
                    <strong className="text-pink-600 dark:text-pink-400">100% gratuit et open source</strong> : le code source est disponible sur GitHub et le restera toujours.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-500 dark:bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">💰</span>
                </div>
                <div>
                  <p className="text-gray-800 dark:text-gray-200 text-lg leading-relaxed">
                    <strong className="text-blue-600 dark:text-blue-400">Infrastructure coûteuse</strong> : la passerelle Enedis nécessite des serveurs, une base de données, du cache Redis et de la bande passante pour servir tous les utilisateurs.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-500 dark:bg-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">⚙️</span>
                </div>
                <div>
                  <p className="text-gray-800 dark:text-gray-200 text-lg leading-relaxed">
                    <strong className="text-purple-600 dark:text-purple-400">Maintenance continue</strong> : mises à jour de sécurité, évolutions de l'API Enedis, support utilisateurs et développement de nouvelles fonctionnalités.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-8 border border-pink-200 dark:border-pink-700">
              <p className="text-center text-gray-700 dark:text-gray-300 text-lg mb-4">
                Votre donation permet de <strong>maintenir la passerelle en ligne</strong> et de continuer à offrir ce service gratuitement à toute la communauté.
              </p>
              <p className="text-center text-gray-600 dark:text-gray-400">
                Chaque contribution, même minime, fait la différence ! 🙏
              </p>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-center gap-8">
              {/* Bouton de donation */}
              <div className="text-center">
                <a
                  href="https://www.paypal.com/donate/?business=FY25JLXDYLXAJ&no_recurring=0&currency_code=EUR"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white rounded-xl font-bold text-xl transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-105"
                >
                  <Heart size={24} className="animate-pulse" />
                  Faire une donation
                  <Heart size={24} className="animate-pulse" />
                </a>
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                  Paiement sécurisé via PayPal
                </p>
              </div>

              {/* QR Code */}
              <div className="text-center">
                <div className="bg-white p-4 rounded-xl shadow-lg inline-block">
                  <img
                    src="/paypal.png"
                    alt="QR Code PayPal Donation"
                    className="w-32 h-32"
                  />
                </div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Scannez pour donner
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final avec effet de profondeur */}
      <section
        className="relative py-16 overflow-hidden"
      >
        {/* Fond avec gradient animé */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-purple-600 dark:from-primary-800 dark:via-primary-900 dark:to-purple-900" />

        {/* Motif de points */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 text-white">
            Prêt à commencer ?
          </h2>
          <p className="text-xl lg:text-2xl text-white/90 mb-10 leading-relaxed">
            Créez votre compte gratuitement et obtenez vos identifiants API en quelques minutes.
          </p>
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="group inline-flex items-center gap-3 px-10 py-5 bg-white text-primary-600 rounded-xl font-bold text-xl hover:bg-gray-50 transition-all duration-300 shadow-2xl hover:shadow-3xl hover:scale-105"
            >
              Accéder au dashboard
              <ArrowRight className="group-hover:translate-x-2 transition-transform duration-300" size={24} />
            </Link>
          ) : (
            <Link
              to="/signup"
              className="group inline-flex items-center gap-3 px-10 py-5 bg-white text-primary-600 rounded-xl font-bold text-xl hover:bg-gray-50 transition-all duration-300 shadow-2xl hover:shadow-3xl hover:scale-105"
            >
              Créer mon compte gratuitement
              <ArrowRight className="group-hover:translate-x-2 transition-transform duration-300" size={24} />
            </Link>
          )}
        </div>
      </section>

      {/* Footer minimaliste */}
      <footer className="bg-gray-900 dark:bg-black text-gray-400 py-12 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-lg mb-4">
            Créé avec ❤️ par un passionné de domotique
          </p>
          <p className="text-sm">
            Un projet open source pour la communauté
          </p>
        </div>
      </footer>

      {/* CSS pour les animations personnalisées */}
      <style>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        @keyframes bounce-subtle {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        .animate-fade-in-up {
          animation: fade-in-up 1s ease-out;
        }

        .animate-fade-in {
          animation: fade-in 1s ease-out;
        }

        .animate-blink {
          animation: blink 1s step-end infinite;
        }

        .animate-bounce-subtle {
          animation: bounce-subtle 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
