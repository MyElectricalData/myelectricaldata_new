import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, XCircle, AlertCircle, Info, X, Loader2 } from 'lucide-react'
import { useNotificationStore, type Toast as ToastType, type NotificationType } from '../stores/notificationStore'

// Icon and color configurations per type
const TOAST_CONFIG: Record<
  NotificationType,
  {
    icon: typeof CheckCircle
    bgClass: string
    borderClass: string
    textClass: string
    iconClass: string
  }
> = {
  success: {
    icon: CheckCircle,
    bgClass: 'bg-green-50 dark:bg-green-900/20',
    borderClass: 'border-green-200 dark:border-green-800',
    textClass: 'text-green-800 dark:text-green-200',
    iconClass: 'text-green-600 dark:text-green-400',
  },
  error: {
    icon: XCircle,
    bgClass: 'bg-red-50 dark:bg-red-900/20',
    borderClass: 'border-red-200 dark:border-red-800',
    textClass: 'text-red-800 dark:text-red-200',
    iconClass: 'text-red-600 dark:text-red-400',
  },
  warning: {
    icon: AlertCircle,
    bgClass: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderClass: 'border-yellow-200 dark:border-yellow-800',
    textClass: 'text-yellow-800 dark:text-yellow-200',
    iconClass: 'text-yellow-600 dark:text-yellow-400',
  },
  info: {
    icon: Info,
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    borderClass: 'border-blue-200 dark:border-blue-800',
    textClass: 'text-blue-800 dark:text-blue-200',
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
  loading: {
    icon: Loader2,
    bgClass: 'bg-gray-50 dark:bg-gray-800/50',
    borderClass: 'border-gray-200 dark:border-gray-700',
    textClass: 'text-gray-800 dark:text-gray-200',
    iconClass: 'text-primary-600 dark:text-primary-400 animate-spin',
  },
}

interface ToastItemProps {
  toast: ToastType
  onRemove: (id: string) => void
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  const config = TOAST_CONFIG[toast.type]
  const Icon = config.icon

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = setTimeout(() => setIsVisible(true), 10)
    return () => clearTimeout(enterTimer)
  }, [])

  const handleRemove = () => {
    setIsLeaving(true)
    setTimeout(() => onRemove(toast.id), 200)
  }

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-lg border shadow-lg backdrop-blur-sm
        transition-all duration-200 ease-out
        ${config.bgClass} ${config.borderClass}
        ${isVisible && !isLeaving ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
        min-w-[320px] max-w-[480px]
      `}
      role="alert"
      aria-live="polite"
    >
      <Icon className={`${config.iconClass} flex-shrink-0 mt-0.5`} size={20} />
      <p className={`${config.textClass} font-medium flex-1 text-sm`}>{toast.message}</p>
      {toast.dismissible && (
        <button
          onClick={handleRemove}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors flex-shrink-0"
          aria-label="Fermer"
        >
          <X size={18} />
        </button>
      )}
    </div>
  )
}

export function ToastContainer() {
  const toasts = useNotificationStore((state) => state.toasts)
  const removeToast = useNotificationStore((state) => state.removeToast)

  // Don't render anything if no toasts
  if (toasts.length === 0) return null

  return createPortal(
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onRemove={removeToast} />
        </div>
      ))}
    </div>,
    document.body
  )
}

export default ToastContainer
