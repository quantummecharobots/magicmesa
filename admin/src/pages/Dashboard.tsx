import { useState } from 'react'
import {
  Activity,
  Server,
  Users,
  Zap,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Settings,
  RefreshCw,
  Sparkles,
  Eye,
  Filter
} from 'lucide-react'
import { useMetrics, type LogEntry, type AppConfig } from '../hooks/useMetrics'

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${(cost * 100).toFixed(3)}c`
  return `$${cost.toFixed(4)}`
}

function formatTimestamp(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleTimeString()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// Stat Card Component
function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  color = 'gold'
}: {
  icon: React.ElementType
  label: string
  value: string | number
  subValue?: string
  color?: 'gold' | 'green' | 'blue' | 'red'
}) {
  const colorClasses = {
    gold: 'text-mesa-gold',
    green: 'text-mesa-green',
    blue: 'text-blue-400',
    red: 'text-mesa-red'
  }

  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${colorClasses[color]}`} />
        <span className="stat-label">{label}</span>
      </div>
      <div className={`stat-value ${colorClasses[color]}`}>{value}</div>
      {subValue && <div className="text-mesa-text-secondary text-sm mt-1">{subValue}</div>}
    </div>
  )
}

// Log Entry Component
function LogEntryRow({ entry }: { entry: LogEntry }) {
  const severityColors = {
    debug: 'text-gray-400',
    info: 'text-blue-400',
    warn: 'text-amber-400',
    error: 'text-red-400'
  }

  const categoryColors: Record<string, string> = {
    CardRecognition: 'bg-purple-500/20 text-purple-300',
    Room: 'bg-emerald-500/20 text-emerald-300',
    Socket: 'bg-blue-500/20 text-blue-300',
    API: 'bg-amber-500/20 text-amber-300',
    Admin: 'bg-mesa-gold/20 text-mesa-gold',
    System: 'bg-gray-500/20 text-gray-300'
  }

  return (
    <div className={`log-entry ${entry.severity}`}>
      <div className="flex items-center gap-2">
        <span className="text-mesa-text-secondary text-xs w-20">
          {formatTimestamp(entry.timestamp)}
        </span>
        <span className={`px-2 py-0.5 rounded text-xs ${categoryColors[entry.category] || 'bg-gray-500/20'}`}>
          {entry.category}
        </span>
        <span className={`${severityColors[entry.severity]} uppercase text-xs font-medium w-12`}>
          {entry.severity}
        </span>
        <span className="text-mesa-text flex-1 truncate">{entry.message}</span>
      </div>
      {entry.data && (
        <div className="ml-[8.5rem] mt-1 text-xs text-mesa-text-secondary font-mono">
          {JSON.stringify(entry.data)}
        </div>
      )}
    </div>
  )
}

// Card Recognition Feed Component
function CardRecognitionFeed({
  history
}: {
  history: Array<{
    timestamp: Date
    success: boolean
    cardName: string | null
    duration: number
    imageSizeKB: number
    inputTokens?: number
    outputTokens?: number
  }>
}) {
  const [showFailedOnly, setShowFailedOnly] = useState(false)
  const filtered = showFailedOnly ? history.filter(r => !r.success) : history

  return (
    <div className="panel-ornate p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="panel-header text-lg text-mesa-gold flex items-center gap-2 mb-0 pb-0 bg-none">
          <Eye className="w-5 h-5" />
          Card Recognition Log
        </h2>
        <button
          onClick={() => setShowFailedOnly(!showFailedOnly)}
          className={`btn-secondary text-xs flex items-center gap-1 ${showFailedOnly ? 'border-mesa-red' : ''}`}
        >
          <Filter className="w-3 h-3" />
          {showFailedOnly ? 'Show All' : 'Failed Only'}
        </button>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center text-mesa-text-secondary py-8">
            No card scans yet
          </div>
        ) : (
          filtered.map((record, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-2 rounded ${
                record.success ? 'bg-emerald-500/10' : 'bg-red-500/10'
              }`}
            >
              {record.success ? (
                <CheckCircle className="w-4 h-4 text-mesa-green flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-mesa-red flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {record.cardName || 'Unknown Card'}
                </div>
                <div className="text-xs text-mesa-text-secondary flex gap-3">
                  <span>{formatTimestamp(record.timestamp)}</span>
                  <span>{formatDuration(record.duration)}</span>
                  <span>{record.imageSizeKB} KB</span>
                  {record.inputTokens && (
                    <span>{record.inputTokens + (record.outputTokens || 0)} tokens</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Configuration Panel Component
function ConfigPanel({
  config,
  onUpdate
}: {
  config: AppConfig
  onUpdate: (updates: Partial<AppConfig>) => Promise<AppConfig>
}) {
  const [saving, setSaving] = useState(false)
  const [localConfig, setLocalConfig] = useState(config)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdate(localConfig)
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = JSON.stringify(config) !== JSON.stringify(localConfig)

  return (
    <div className="panel-ornate p-4">
      <h2 className="panel-header text-lg text-mesa-gold flex items-center gap-2">
        <Settings className="w-5 h-5" />
        Configuration
      </h2>

      <div className="space-y-4">
        {/* Room Settings */}
        <div>
          <h3 className="text-mesa-text-secondary text-sm font-medium mb-2">Room Settings</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-mesa-text-secondary mb-1">
                Timeout (seconds)
              </label>
              <input
                type="number"
                className="input-ornate text-sm"
                value={localConfig.room.timeoutMs / 1000}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    room: { ...localConfig.room, timeoutMs: Number(e.target.value) * 1000 }
                  })
                }
              />
            </div>
            <div>
              <label className="block text-xs text-mesa-text-secondary mb-1">Max Players</label>
              <input
                type="number"
                className="input-ornate text-sm"
                value={localConfig.room.maxPlayers}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    room: { ...localConfig.room, maxPlayers: Number(e.target.value) }
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Feature Flags */}
        <div>
          <h3 className="text-mesa-text-secondary text-sm font-medium mb-2">Features</h3>
          <div className="space-y-2">
            {Object.entries(localConfig.features).map(([key, value]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      features: { ...localConfig.features, [key]: e.target.checked }
                    })
                  }
                  className="w-4 h-4 accent-mesa-gold"
                />
                <span className="text-sm">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Card Recognition */}
        <div>
          <h3 className="text-mesa-text-secondary text-sm font-medium mb-2">Card Recognition</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-mesa-text-secondary mb-1">Model</label>
              <input
                type="text"
                className="input-ornate text-sm"
                value={localConfig.cardRecognition.model}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    cardRecognition: { ...localConfig.cardRecognition, model: e.target.value }
                  })
                }
              />
            </div>
            <div>
              <label className="block text-xs text-mesa-text-secondary mb-1">Max Tokens</label>
              <input
                type="number"
                className="input-ornate text-sm"
                value={localConfig.cardRecognition.maxTokens}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    cardRecognition: {
                      ...localConfig.cardRecognition,
                      maxTokens: Number(e.target.value)
                    }
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="btn-gold w-full flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </div>
  )
}

// Main Dashboard Component
export default function Dashboard() {
  const { metrics, logs, config, connected, error, updateConfig, refreshLogs } = useMetrics()
  const [logCategory, setLogCategory] = useState<string>('')

  // Debug log
  console.log('[Dashboard] State:', { metrics: !!metrics, connected, error })

  const handleCategoryFilter = (category: string) => {
    setLogCategory(category)
    refreshLogs({ category: category || undefined, limit: 100 })
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="header-ornate px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-mesa-gold" />
            <h1 className="font-fantasy text-2xl text-mesa-gold text-glow">
              Magic Mesa Admin
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className={`status-dot ${connected ? 'success pulse-glow' : 'error'}`} />
            <span className="text-sm text-mesa-text-secondary">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/20 border-b border-red-500 px-6 py-2 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        {!metrics ? (
          <div style={{ textAlign: 'center', padding: '5rem 0' }}>
            <RefreshCw className="w-8 h-8 text-mesa-gold animate-spin mx-auto mb-4" style={{ width: 32, height: 32, color: '#D4AF37' }} />
            <p style={{ color: '#9d94b8' }}>Loading metrics...</p>
            {error && <p style={{ color: '#ef4444', marginTop: '1rem' }}>{error}</p>}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <StatCard
                icon={Clock}
                label="Uptime"
                value={metrics.uptime.uptimeFormatted}
                color="gold"
              />
              <StatCard
                icon={Server}
                label="Active Rooms"
                value={metrics.rooms.activeRooms}
                subValue={`Peak: ${metrics.rooms.peakRooms}`}
                color="blue"
              />
              <StatCard
                icon={Users}
                label="Connections"
                value={metrics.sockets.currentConnections}
                subValue={`Peak: ${metrics.sockets.peakConnections}`}
                color="green"
              />
              <StatCard
                icon={Activity}
                label="Card Scans"
                value={metrics.cardRecognition.totalCalls}
                subValue={`${metrics.cardRecognition.successRate.toFixed(1)}% success`}
                color="gold"
              />
              <StatCard
                icon={Zap}
                label="API Calls Today"
                value={metrics.anthropic.callsToday}
                color="blue"
              />
              <StatCard
                icon={DollarSign}
                label="Est. Cost"
                value={formatCost(metrics.anthropic.estimatedCostUSD)}
                subValue={`${(metrics.anthropic.totalInputTokens + metrics.anthropic.totalOutputTokens).toLocaleString()} tokens`}
                color="gold"
              />
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Card Recognition Feed */}
              <div className="lg:col-span-2">
                <CardRecognitionFeed history={metrics.cardRecognition.recentHistory} />
              </div>

              {/* Config Panel */}
              {config && (
                <div>
                  <ConfigPanel config={config} onUpdate={updateConfig} />
                </div>
              )}
            </div>

            {/* Logs Section */}
            <div className="panel-ornate p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="panel-header text-lg text-mesa-gold flex items-center gap-2 mb-0 pb-0 bg-none">
                  <Activity className="w-5 h-5" />
                  Server Logs
                </h2>
                <div className="flex gap-2">
                  {['', 'CardRecognition', 'Room', 'Socket', 'API', 'Admin'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => handleCategoryFilter(cat)}
                      className={`btn-secondary text-xs ${logCategory === cat ? 'border-mesa-gold text-mesa-gold' : ''}`}
                    >
                      {cat || 'All'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="text-center text-mesa-text-secondary py-8">No logs yet</div>
                ) : (
                  logs.map((entry) => <LogEntryRow key={entry.id} entry={entry} />)
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
