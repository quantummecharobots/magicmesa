// Structured logging service for Magic Mesa admin portal

export type LogCategory = 'CardRecognition' | 'Room' | 'Socket' | 'API' | 'Admin' | 'System'
export type LogSeverity = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  timestamp: Date
  category: LogCategory
  severity: LogSeverity
  message: string
  data?: Record<string, unknown>
}

class LoggerService {
  private buffer: LogEntry[] = []
  private readonly MAX_ENTRIES = 1000
  private idCounter = 0
  private subscribers: Set<(entry: LogEntry) => void> = new Set()

  private generateId(): string {
    return `log_${Date.now()}_${this.idCounter++}`
  }

  private addEntry(entry: LogEntry): void {
    this.buffer.unshift(entry)
    if (this.buffer.length > this.MAX_ENTRIES) {
      this.buffer.pop()
    }

    // Notify subscribers
    this.subscribers.forEach(callback => callback(entry))

    // Also log to console
    const prefix = `[${entry.category}]`
    const logFn = entry.severity === 'error' ? console.error
      : entry.severity === 'warn' ? console.warn
        : console.log
    logFn(prefix, entry.message, entry.data || '')
  }

  log(category: LogCategory, severity: LogSeverity, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      category,
      severity,
      message,
      data
    }
    this.addEntry(entry)
  }

  // Convenience methods
  debug(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log(category, 'debug', message, data)
  }

  info(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log(category, 'info', message, data)
  }

  warn(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log(category, 'warn', message, data)
  }

  error(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log(category, 'error', message, data)
  }

  // Get logs with optional filtering
  getLogs(options?: {
    category?: LogCategory
    severity?: LogSeverity
    limit?: number
    offset?: number
  }): LogEntry[] {
    let filtered = this.buffer

    if (options?.category) {
      filtered = filtered.filter(e => e.category === options.category)
    }
    if (options?.severity) {
      filtered = filtered.filter(e => e.severity === options.severity)
    }

    const offset = options?.offset || 0
    const limit = options?.limit || 100

    return filtered.slice(offset, offset + limit)
  }

  // Subscribe to real-time log entries
  subscribe(callback: (entry: LogEntry) => void): () => void {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  // Get all unique categories with counts
  getCategoryCounts(): Record<LogCategory, number> {
    const counts: Record<LogCategory, number> = {
      CardRecognition: 0,
      Room: 0,
      Socket: 0,
      API: 0,
      Admin: 0,
      System: 0
    }

    for (const entry of this.buffer) {
      counts[entry.category]++
    }

    return counts
  }
}

export const logger = new LoggerService()
