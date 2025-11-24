import { useEffect, useRef } from 'react'

const CHANNEL_NAME = 'myelectricaldata-cache-sync'

export interface CacheBroadcastMessage {
  type: 'CACHE_UPDATED' | 'CACHE_CLEARED'
  timestamp: number
  source?: string
}

/**
 * Hook pour gérer la synchronisation du cache entre onglets
 * Utilise l'API BroadcastChannel du navigateur
 */
export function useCacheBroadcast() {
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    // Check if BroadcastChannel is supported
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('[CacheBroadcast] BroadcastChannel API not supported in this browser')
      return
    }

    // Create channel
    channelRef.current = new BroadcastChannel(CHANNEL_NAME)
    console.log('[CacheBroadcast] Channel created:', CHANNEL_NAME)

    return () => {
      if (channelRef.current) {
        channelRef.current.close()
        channelRef.current = null
        console.log('[CacheBroadcast] Channel closed')
      }
    }
  }, [])

  const broadcast = (message: CacheBroadcastMessage) => {
    if (channelRef.current) {
      console.log('[CacheBroadcast] Sending message:', message)
      channelRef.current.postMessage(message)
      console.log('[CacheBroadcast] ✓ Message sent successfully')
    } else {
      console.warn('[CacheBroadcast] ⚠️ Cannot broadcast: channel is null')
    }
  }

  const subscribe = (callback: (message: CacheBroadcastMessage) => void) => {
    if (!channelRef.current) return () => {}

    const handler = (event: MessageEvent<CacheBroadcastMessage>) => {
      console.log('[CacheBroadcast] Message received:', event.data)
      callback(event.data)
    }

    channelRef.current.addEventListener('message', handler)

    return () => {
      if (channelRef.current) {
        channelRef.current.removeEventListener('message', handler)
      }
    }
  }

  return { broadcast, subscribe }
}
