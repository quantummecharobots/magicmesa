import { io, Socket } from 'socket.io-client'

// Types matching backend
export interface CardRecognitionRecord {
  timestamp: Date
  success: boolean
  cardName: string | null
  duration: number
  imageSizeKB: number
  inputTokens?: number
  outputTokens?: number
}

export interface MetricsSnapshot {
  uptime: {
    startTime: Date
    uptimeMs: number
    uptimeFormatted: string
  }
  cardRecognition: {
    totalCalls: number
    successfulCalls: number
    failedCalls: number
    successRate: number
    recentHistory: CardRecognitionRecord[]
  }
  anthropic: {
    totalInputTokens: number
    totalOutputTokens: number
    estimatedCostUSD: number
    callsToday: number
  }
  rooms: {
    activeRooms: number
    peakRooms: number
  }
  sockets: {
    currentConnections: number
    peakConnections: number
    totalConnections: number
  }
}

export interface LogEntry {
  id: string
  timestamp: Date
  category: string
  severity: 'debug' | 'info' | 'warn' | 'error'
  message: string
  data?: Record<string, unknown>
}

export interface AppConfig {
  room: {
    timeoutMs: number
    maxPlayers: number
    allowPublicRooms: boolean
  }
  cardRecognition: {
    model: string
    maxTokens: number
    prompt: string
    enabled: boolean
  }
  features: {
    webrtcEnabled: boolean
    cardRecognitionEnabled: boolean
    commanderDamageTracking: boolean
  }
}

const API_BASE = '/api/admin'

class AdminAPI {
  private socket: Socket | null = null
  private metricsListeners: Set<(metrics: MetricsSnapshot) => void> = new Set()
  private logListeners: Set<(log: LogEntry) => void> = new Set()
  private cardRecognitionListeners: Set<(record: CardRecognitionRecord) => void> = new Set()

  connect(): void {
    if (this.socket?.connected) return

    this.socket = io('/admin', {
      transports: ['websocket', 'polling']
    })

    this.socket.on('connect', () => {
      console.log('[Admin] Connected to admin namespace')
    })

    this.socket.on('disconnect', () => {
      console.log('[Admin] Disconnected from admin namespace')
    })

    this.socket.on('metrics-update', (metrics: MetricsSnapshot) => {
      this.metricsListeners.forEach(cb => cb(metrics))
    })

    this.socket.on('log-entry', (entry: LogEntry) => {
      this.logListeners.forEach(cb => cb(entry))
    })

    this.socket.on('card-recognition', (record: CardRecognitionRecord) => {
      this.cardRecognitionListeners.forEach(cb => cb(record))
    })
  }

  disconnect(): void {
    this.socket?.disconnect()
    this.socket = null
  }

  onMetricsUpdate(callback: (metrics: MetricsSnapshot) => void): () => void {
    this.metricsListeners.add(callback)
    return () => this.metricsListeners.delete(callback)
  }

  onLogEntry(callback: (log: LogEntry) => void): () => void {
    this.logListeners.add(callback)
    return () => this.logListeners.delete(callback)
  }

  onCardRecognition(callback: (record: CardRecognitionRecord) => void): () => void {
    this.cardRecognitionListeners.add(callback)
    return () => this.cardRecognitionListeners.delete(callback)
  }

  // REST API methods
  async getMetrics(): Promise<MetricsSnapshot> {
    const res = await fetch(`${API_BASE}/metrics`)
    if (!res.ok) throw new Error('Failed to fetch metrics')
    return res.json()
  }

  async getLogs(options?: { category?: string; limit?: number }): Promise<{ logs: LogEntry[]; total: number }> {
    const params = new URLSearchParams()
    if (options?.category) params.set('category', options.category)
    if (options?.limit) params.set('limit', String(options.limit))

    const res = await fetch(`${API_BASE}/logs?${params}`)
    if (!res.ok) throw new Error('Failed to fetch logs')
    return res.json()
  }

  async getConfig(): Promise<AppConfig> {
    const res = await fetch(`${API_BASE}/config`)
    if (!res.ok) throw new Error('Failed to fetch config')
    return res.json()
  }

  async updateConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })
    if (!res.ok) throw new Error('Failed to update config')
    return res.json()
  }
}

export const adminAPI = new AdminAPI()
