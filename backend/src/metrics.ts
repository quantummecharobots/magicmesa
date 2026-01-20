// In-memory metrics store for Magic Mesa admin portal

export interface CardRecognitionRecord {
  timestamp: Date
  success: boolean
  cardName: string | null
  duration: number // ms
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

class MetricsStore {
  private serverStartTime: Date = new Date()

  // Card recognition metrics
  private cardRecognitionHistory: CardRecognitionRecord[] = []
  private totalCardCalls = 0
  private successfulCardCalls = 0
  private failedCardCalls = 0

  // Anthropic token usage
  private totalInputTokens = 0
  private totalOutputTokens = 0
  private callsToday = 0
  private lastResetDate: string = new Date().toDateString()

  // Room metrics
  private peakRooms = 0

  // Socket metrics
  private currentConnections = 0
  private peakConnections = 0
  private totalConnections = 0

  // Pricing for Claude Opus 4 (per million tokens)
  private readonly INPUT_PRICE_PER_MILLION = 15 // $15 per 1M input tokens
  private readonly OUTPUT_PRICE_PER_MILLION = 75 // $75 per 1M output tokens
  private readonly MAX_HISTORY_SIZE = 100

  recordCardRecognition(record: Omit<CardRecognitionRecord, 'timestamp'>): void {
    const fullRecord: CardRecognitionRecord = {
      ...record,
      timestamp: new Date()
    }

    this.cardRecognitionHistory.unshift(fullRecord)
    if (this.cardRecognitionHistory.length > this.MAX_HISTORY_SIZE) {
      this.cardRecognitionHistory.pop()
    }

    this.totalCardCalls++
    if (record.success) {
      this.successfulCardCalls++
    } else {
      this.failedCardCalls++
    }

    // Track Anthropic tokens
    if (record.inputTokens) {
      this.totalInputTokens += record.inputTokens
    }
    if (record.outputTokens) {
      this.totalOutputTokens += record.outputTokens
    }

    // Reset daily counter if new day
    const today = new Date().toDateString()
    if (today !== this.lastResetDate) {
      this.callsToday = 0
      this.lastResetDate = today
    }
    this.callsToday++
  }

  recordSocketConnect(): void {
    this.currentConnections++
    this.totalConnections++
    if (this.currentConnections > this.peakConnections) {
      this.peakConnections = this.currentConnections
    }
  }

  recordSocketDisconnect(): void {
    this.currentConnections = Math.max(0, this.currentConnections - 1)
  }

  updateRoomCount(activeRooms: number): void {
    if (activeRooms > this.peakRooms) {
      this.peakRooms = activeRooms
    }
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  private calculateCost(): number {
    const inputCost = (this.totalInputTokens / 1_000_000) * this.INPUT_PRICE_PER_MILLION
    const outputCost = (this.totalOutputTokens / 1_000_000) * this.OUTPUT_PRICE_PER_MILLION
    return inputCost + outputCost
  }

  getSnapshot(activeRooms: number): MetricsSnapshot {
    const uptimeMs = Date.now() - this.serverStartTime.getTime()

    // Ensure daily counter is current
    const today = new Date().toDateString()
    if (today !== this.lastResetDate) {
      this.callsToday = 0
      this.lastResetDate = today
    }

    return {
      uptime: {
        startTime: this.serverStartTime,
        uptimeMs,
        uptimeFormatted: this.formatUptime(uptimeMs)
      },
      cardRecognition: {
        totalCalls: this.totalCardCalls,
        successfulCalls: this.successfulCardCalls,
        failedCalls: this.failedCardCalls,
        successRate: this.totalCardCalls > 0
          ? (this.successfulCardCalls / this.totalCardCalls) * 100
          : 0,
        recentHistory: this.cardRecognitionHistory.slice(0, 50)
      },
      anthropic: {
        totalInputTokens: this.totalInputTokens,
        totalOutputTokens: this.totalOutputTokens,
        estimatedCostUSD: this.calculateCost(),
        callsToday: this.callsToday
      },
      rooms: {
        activeRooms,
        peakRooms: this.peakRooms
      },
      sockets: {
        currentConnections: this.currentConnections,
        peakConnections: this.peakConnections,
        totalConnections: this.totalConnections
      }
    }
  }

  getRecentCardHistory(): CardRecognitionRecord[] {
    return this.cardRecognitionHistory.slice(0, 50)
  }
}

export const metrics = new MetricsStore()
