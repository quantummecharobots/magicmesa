import { useState, useEffect, useCallback } from 'react'
import { adminAPI, type MetricsSnapshot, type LogEntry, type CardRecognitionRecord, type AppConfig } from '../lib/api'

export function useMetrics() {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize connection and fetch initial data
  useEffect(() => {
    const init = async () => {
      console.log('[useMetrics] Initializing...')
      try {
        // Connect to Socket.IO
        adminAPI.connect()
        setConnected(true)
        console.log('[useMetrics] Socket connected')

        // Fetch initial data
        console.log('[useMetrics] Fetching initial data...')
        const [initialMetrics, initialLogs, initialConfig] = await Promise.all([
          adminAPI.getMetrics(),
          adminAPI.getLogs({ limit: 100 }),
          adminAPI.getConfig()
        ])

        console.log('[useMetrics] Data fetched:', { metrics: !!initialMetrics, logs: initialLogs.logs.length })
        setMetrics(initialMetrics)
        setLogs(initialLogs.logs)
        setConfig(initialConfig)
        setError(null)
      } catch (err) {
        console.error('[useMetrics] Init error:', err)
        setError(err instanceof Error ? err.message : 'Failed to connect')
        setConnected(false)
      }
    }

    init()

    return () => {
      adminAPI.disconnect()
    }
  }, [])

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubMetrics = adminAPI.onMetricsUpdate((newMetrics) => {
      setMetrics(newMetrics)
    })

    const unsubLogs = adminAPI.onLogEntry((entry) => {
      setLogs(prev => [entry, ...prev].slice(0, 500))
    })

    const unsubCardRecognition = adminAPI.onCardRecognition((record) => {
      // Card recognition events are already included in metrics updates
      // but we could use this for real-time notifications
      console.log('[Admin] Card recognized:', record.cardName)
    })

    return () => {
      unsubMetrics()
      unsubLogs()
      unsubCardRecognition()
    }
  }, [])

  const updateConfig = useCallback(async (updates: Partial<AppConfig>) => {
    try {
      const newConfig = await adminAPI.updateConfig(updates)
      setConfig(newConfig)
      return newConfig
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update config')
      throw err
    }
  }, [])

  const refreshMetrics = useCallback(async () => {
    try {
      const newMetrics = await adminAPI.getMetrics()
      setMetrics(newMetrics)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh metrics')
    }
  }, [])

  const refreshLogs = useCallback(async (options?: { category?: string; limit?: number }) => {
    try {
      const result = await adminAPI.getLogs(options)
      setLogs(result.logs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh logs')
    }
  }, [])

  return {
    metrics,
    logs,
    config,
    connected,
    error,
    updateConfig,
    refreshMetrics,
    refreshLogs
  }
}

export type { MetricsSnapshot, LogEntry, CardRecognitionRecord, AppConfig }
