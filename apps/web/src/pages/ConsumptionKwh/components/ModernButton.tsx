import { LucideIcon } from 'lucide-react'
import { ButtonHTMLAttributes, forwardRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'gradient' | 'glass' | 'tab'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ModernButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  iconPosition?: 'left' | 'right'
  isActive?: boolean
  loading?: boolean
  fullWidth?: boolean
}

export const ModernButton = forwardRef<HTMLButtonElement, ModernButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      icon: Icon,
      iconPosition = 'left',
      isActive = false,
      loading = false,
      disabled = false,
      fullWidth = false,
      className = '',
      ...props
    },
    ref
  ) => {
    // Base styles
    const baseStyles = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-[background-color,border-color,box-shadow,filter] duration-200 relative overflow-hidden group will-change-[filter]'

    // Size variants
    const sizeStyles = {
      sm: 'px-3 py-2 text-sm',
      md: 'px-3.5 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    }

    // Variant styles with glassmorphism and gradients
    const variantStyles = {
      primary: `
        bg-gradient-to-r from-primary-500 via-primary-600 to-primary-700
        hover:from-primary-600 hover:via-primary-700 hover:to-primary-800
        text-white shadow-lg shadow-primary-500/50 dark:shadow-primary-500/30
        hover:shadow-xl hover:shadow-primary-600/60 dark:hover:shadow-primary-600/40
        hover:scale-[1.01] active:scale-[0.99]
        disabled:from-gray-400 disabled:via-gray-500 disabled:to-gray-600
        disabled:shadow-none disabled:cursor-not-allowed disabled:hover:scale-100
        before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/0 before:via-white/20 before:to-white/0
        before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700
      `,
      secondary: `
        bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm
        border-2 border-gray-200 dark:border-gray-700
        text-gray-700 dark:text-gray-300
        hover:bg-white dark:hover:bg-gray-800
        hover:border-primary-400 dark:hover:border-primary-500
        hover:shadow-lg hover:shadow-gray-300/50 dark:hover:shadow-gray-900/50
        hover:scale-[1.01] active:scale-[0.99]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
      `,
      gradient: `
        bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600
        hover:from-blue-600 hover:via-indigo-700 hover:to-purple-700
        text-white shadow-md shadow-indigo-500/40 dark:shadow-indigo-500/30
        hover:shadow-lg hover:shadow-indigo-600/50 dark:hover:shadow-indigo-600/40
        hover:scale-[1.01] active:scale-[0.99]
        disabled:from-gray-400 disabled:via-gray-500 disabled:to-gray-600
        disabled:shadow-none disabled:cursor-not-allowed disabled:hover:scale-100
        before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/0 before:via-white/30 before:to-white/0
        before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700
      `,
      glass: `
        bg-white/10 dark:bg-gray-900/10 backdrop-blur-md
        border border-white/20 dark:border-gray-700/50
        text-gray-900 dark:text-white
        hover:bg-white/20 dark:hover:bg-gray-900/20
        hover:border-white/30 dark:hover:border-gray-600/50
        hover:shadow-xl hover:shadow-primary-500/20
        hover:scale-[1.01] active:scale-[0.99]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
      `,
      tab: `
        border-2
        ${isActive
          ? 'bg-gradient-to-r from-primary-500 to-primary-600 border-primary-600 text-white shadow-sm shadow-primary-500/10 dark:shadow-primary-500/8 hover:shadow-md hover:shadow-primary-500/15 hover:brightness-110 active:brightness-95'
          : 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-750 active:bg-gray-100 dark:active:bg-gray-700'
        }
        ${isActive ? 'before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/0 before:via-white/20 before:to-white/0 before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700' : ''}
      `,
    }

    const widthStyles = fullWidth ? 'w-full' : ''

    const iconSize = size === 'sm' ? 16 : size === 'md' ? 20 : 24

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          ${baseStyles}
          ${sizeStyles[size]}
          ${variantStyles[variant]}
          ${widthStyles}
          ${className}
        `}
        {...props}
      >
        {loading && iconPosition === 'left' && (
          <svg className="animate-spin" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}

        {!loading && Icon && iconPosition === 'left' && (
          <Icon size={iconSize} className="flex-shrink-0 transition-transform group-hover:scale-110" />
        )}

        <span className="relative z-10">{children}</span>

        {!loading && Icon && iconPosition === 'right' && (
          <Icon size={iconSize} className="flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
        )}

        {loading && iconPosition === 'right' && (
          <svg className="animate-spin" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
      </button>
    )
  }
)

ModernButton.displayName = 'ModernButton'
