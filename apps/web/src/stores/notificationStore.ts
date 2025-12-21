import { create } from 'zustand'

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'loading'

export interface Toast {
  id: string
  type: NotificationType
  message: string
  duration?: number
  dismissible?: boolean
}

interface NotificationState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => string
  removeToast: (id: string) => void
  clearAll: () => void
}

// Utility to generate unique IDs
let toastId = 0
const generateId = () => `toast-${++toastId}-${Date.now()}`

// Default durations per type (in ms) - 0 means no auto-dismiss
const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4000,
  loading: 0, // Loading toasts don't auto-dismiss
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = generateId()
    const duration = toast.duration ?? DEFAULT_DURATIONS[toast.type]
    const dismissible = toast.dismissible ?? true

    const newToast: Toast = {
      ...toast,
      id,
      duration,
      dismissible,
    }

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }))

    // Auto-remove after duration (if duration > 0)
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id)
      }, duration)
    }

    return id
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }))
  },

  clearAll: () => {
    set({ toasts: [] })
  },
}))

// Convenience functions for direct usage
export const toast = {
  success: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
    useNotificationStore.getState().addToast({ type: 'success', message, ...options }),

  error: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
    useNotificationStore.getState().addToast({ type: 'error', message, ...options }),

  warning: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
    useNotificationStore.getState().addToast({ type: 'warning', message, ...options }),

  info: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
    useNotificationStore.getState().addToast({ type: 'info', message, ...options }),

  loading: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
    useNotificationStore.getState().addToast({ type: 'loading', message, ...options }),

  dismiss: (id: string) => useNotificationStore.getState().removeToast(id),

  clearAll: () => useNotificationStore.getState().clearAll(),
}
