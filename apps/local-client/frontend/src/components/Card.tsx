import clsx from 'clsx'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  subtitle?: string
  icon?: ReactNode
  action?: ReactNode
}

export default function Card({
  children,
  className,
  title,
  subtitle,
  icon,
  action,
}: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700',
        className
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="p-2 bg-primary-100 dark:bg-primary-900/50 rounded-lg">
                {icon}
              </div>
            )}
            <div>
              {title && (
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}
