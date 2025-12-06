import { useRef, useEffect } from 'react'
import { MessageCircle, Shield } from 'lucide-react'

export interface ChatMessage {
  id: string
  content: string
  is_from_admin: boolean
  sender_email?: string
  created_at: string
}

interface ChatWhatsAppProps {
  messages: ChatMessage[]
  /** Whether the current user is the admin viewing this chat */
  isAdminView?: boolean
  /** Input value for the message */
  inputValue: string
  /** Callback when input value changes */
  onInputChange: (value: string) => void
  /** Callback when sending a message */
  onSend: () => void
  /** Whether sending is in progress */
  isSending?: boolean
  /** Whether to show the input area */
  showInput?: boolean
  /** Placeholder text for the input */
  placeholder?: string
  /** Minimum height of the chat area */
  minHeight?: string
  /** Maximum height of the chat area */
  maxHeight?: string
}

export default function ChatWhatsApp({
  messages,
  isAdminView = false,
  inputValue,
  onInputChange,
  onSend,
  isSending = false,
  showInput = true,
  placeholder = 'Écrire un message...',
  minHeight = '200px',
  maxHeight = '400px',
}: ChatWhatsAppProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && inputValue.trim()) {
      e.preventDefault()
      onSend()
    }
  }

  // Determine if a message is "mine" based on the view context
  const isMyMessage = (msg: ChatMessage) => {
    if (isAdminView) {
      return msg.is_from_admin
    }
    return !msg.is_from_admin
  }

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
      {/* Messages area */}
      <div
        className="p-4 overflow-y-auto bg-gray-50 dark:bg-gray-900"
        style={{ minHeight, maxHeight }}
      >

        {messages.length > 0 ? (
          <div className="space-y-2 relative">
            {messages.map((msg) => {
              const isMine = isMyMessage(msg)

              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`relative max-w-[85%] px-3 py-2 rounded-lg shadow-sm ${
                      isMine
                        ? 'bg-primary-100 dark:bg-emerald-800 rounded-br-none'
                        : 'bg-white dark:bg-gray-800 rounded-bl-none'
                    }`}
                  >
                    {/* Bubble tail */}
                    <div
                      className={`absolute bottom-0 w-3 h-3 ${
                        isMine
                          ? '-right-1.5 bg-primary-100 dark:bg-emerald-800'
                          : '-left-1.5 bg-white dark:bg-gray-800'
                      }`}
                      style={{
                        clipPath: isMine
                          ? 'polygon(0 0, 100% 100%, 0 100%)'
                          : 'polygon(100% 0, 100% 100%, 0 100%)'
                      }}
                    />

                    {/* Sender label */}
                    {!isMine && (
                      <div className="flex items-center gap-1 text-[10px] font-semibold text-primary-600 dark:text-primary-400 mb-0.5">
                        {isAdminView ? (
                          // Admin viewing contributor's message
                          <span>{msg.sender_email?.split('@')[0] || 'Contributeur'}</span>
                        ) : (
                          // Contributor viewing admin's message
                          <>
                            <Shield size={10} />
                            <span>Modérateur</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Message content */}
                    <p className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-100">
                      {msg.content}
                    </p>

                    {/* Timestamp and check marks */}
                    <div className={`flex items-center justify-end gap-1 mt-1 ${
                      isMine
                        ? 'text-primary-500 dark:text-emerald-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      <span className="text-[10px]">
                        {new Date(msg.created_at).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      {isMine && (
                        <svg className="w-4 h-4" viewBox="0 0 16 15" fill="currentColor">
                          <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <div className="text-center py-8">
              <MessageCircle className="mx-auto mb-2 opacity-50" size={32} />
              <p className="text-sm italic">Aucun message</p>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      {showInput && (
        <div className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isSending}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-900 border-0 rounded-full text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none placeholder-gray-400 dark:placeholder-gray-500 dark:text-white"
          />
          <button
            onClick={onSend}
            disabled={!inputValue.trim() || isSending}
            className="p-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-full transition-colors disabled:cursor-not-allowed"
          >
            {isSending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
