import { useState, useEffect, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useCamera } from '../hooks/useCamera'
import { useWebRTC } from '../hooks/useWebRTC'
import { signaling, PlayerInfo } from '../lib/signaling'
import { GameLayout } from '../components/GameLayout'
import { CardPanel } from '../components/CardPanel'
import { LifeCounter } from '../components/LifeCounter'
import { Copy, Check, LogOut, Search, Settings, Users } from 'lucide-react'

interface LocationState {
  name: string
  seat: number
  startingLife: number
  format: string
  players?: PlayerInfo[]
  isHost: boolean
}

interface Player {
  id: string
  name: string
  seat: number
  life: number
  poison: number
  stream: MediaStream | null
}

export function Room() {
  const { code } = useParams<{ code: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as LocationState | null

  const [players, setPlayers] = useState<Map<string, Player>>(new Map())
  const [myLife, setMyLife] = useState(state?.startingLife || 40)
  const [myPoison, setMyPoison] = useState(0)
  const [commanderDamage, setCommanderDamage] = useState<Record<string, number>>({})
  const [copied, setCopied] = useState(false)
  const [showCardPanel, setShowCardPanel] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const {
    stream,
    startCamera,
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
    settings: cameraSettings,
    devices,
    switchCamera
  } = useCamera()

  const { peers, initiateConnection } = useWebRTC(stream)

  // Initialize camera on mount
  useEffect(() => {
    startCamera()
  }, [startCamera])

  // Initialize existing players from join state
  useEffect(() => {
    if (state?.players) {
      const playerMap = new Map<string, Player>()
      state.players.forEach(p => {
        if (p.id !== signaling.id) {
          playerMap.set(p.id, { ...p, stream: null })
        }
      })
      setPlayers(playerMap)

      // Initiate connections to existing players
      state.players.forEach(p => {
        if (p.id !== signaling.id) {
          initiateConnection(p.id)
        }
      })
    }
  }, [state?.players, initiateConnection])

  // Handle new player joining
  useEffect(() => {
    const handlePlayerJoined = (data: PlayerInfo) => {
      setPlayers(prev => {
        const updated = new Map(prev)
        updated.set(data.id, { ...data, stream: null })
        return updated
      })
      // New player joined, initiate connection
      initiateConnection(data.id)
    }

    const handlePlayerLeft = (data: { id: string }) => {
      setPlayers(prev => {
        const updated = new Map(prev)
        updated.delete(data.id)
        return updated
      })
    }

    const handleLifeUpdated = (data: { playerId: string; life: number }) => {
      setPlayers(prev => {
        const updated = new Map(prev)
        const player = updated.get(data.playerId)
        if (player) {
          updated.set(data.playerId, { ...player, life: data.life })
        }
        return updated
      })
    }

    const handlePoisonUpdated = (data: { playerId: string; poison: number }) => {
      setPlayers(prev => {
        const updated = new Map(prev)
        const player = updated.get(data.playerId)
        if (player) {
          updated.set(data.playerId, { ...player, poison: data.poison })
        }
        return updated
      })
    }

    signaling.on('player-joined', handlePlayerJoined as (...args: unknown[]) => void)
    signaling.on('player-left', handlePlayerLeft as (...args: unknown[]) => void)
    signaling.on('life-updated', handleLifeUpdated as (...args: unknown[]) => void)
    signaling.on('poison-updated', handlePoisonUpdated as (...args: unknown[]) => void)

    return () => {
      signaling.off('player-joined', handlePlayerJoined as (...args: unknown[]) => void)
      signaling.off('player-left', handlePlayerLeft as (...args: unknown[]) => void)
      signaling.off('life-updated', handleLifeUpdated as (...args: unknown[]) => void)
      signaling.off('poison-updated', handlePoisonUpdated as (...args: unknown[]) => void)
    }
  }, [initiateConnection])

  // Update player streams from WebRTC peers
  useEffect(() => {
    setPlayers(prev => {
      const updated = new Map(prev)
      peers.forEach((peer, peerId) => {
        const player = updated.get(peerId)
        if (player && peer.stream) {
          updated.set(peerId, { ...player, stream: peer.stream })
        }
      })
      return updated
    })
  }, [peers])

  const handleLifeChange = useCallback((delta: number) => {
    const newLife = myLife + delta
    setMyLife(newLife)
    signaling.updateLife(newLife)
  }, [myLife])

  const handlePoisonChange = useCallback((delta: number) => {
    const newPoison = Math.max(0, myPoison + delta)
    setMyPoison(newPoison)
    signaling.updatePoison(newPoison)
  }, [myPoison])

  const handleCommanderDamageChange = useCallback((from: string, damage: number) => {
    setCommanderDamage(prev => ({ ...prev, [from]: damage }))
    signaling.updateCommanderDamage(from, damage)
  }, [])

  const copyRoomCode = async () => {
    if (code) {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const leaveRoom = () => {
    signaling.disconnect()
    navigate('/')
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-mesa-dark flex items-center justify-center">
        <div className="text-center">
          <p className="text-mesa-text mb-4">Room session expired</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-mesa-gold rounded text-white"
          >
            Return Home
          </button>
        </div>
      </div>
    )
  }

  const localPlayer = {
    id: signaling.id || '',
    name: state.name,
    seat: state.seat,
    life: myLife,
    poison: myPoison,
    stream,
    audioEnabled,
    videoEnabled
  }

  const remotePlayers = Array.from(players.values())

  const opponents = remotePlayers.map(p => ({ id: p.id, name: p.name }))

  return (
    <div className="h-screen bg-mesa-dark flex flex-col">
      {/* Header */}
      <header className="bg-mesa-surface border-b border-mesa-border px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-mesa-gold font-bold text-xl">Magic Mesa</h1>
          <div className="flex items-center gap-2 bg-mesa-card px-3 py-1.5 rounded">
            <span className="text-mesa-text-secondary text-sm">Room:</span>
            <span className="text-mesa-text font-mono font-bold tracking-wider">{code}</span>
            <button
              onClick={copyRoomCode}
              className="p-1 hover:bg-mesa-border rounded"
              title="Copy room code"
            >
              {copied ? (
                <Check className="w-4 h-4 text-mesa-green" />
              ) : (
                <Copy className="w-4 h-4 text-mesa-text-secondary" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-1 text-mesa-text-secondary text-sm">
            <Users className="w-4 h-4" />
            <span>{remotePlayers.length + 1}/4</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {cameraSettings && (
            <span className="text-mesa-text-secondary text-xs">
              {cameraSettings.width}x{cameraSettings.height} @ {Math.round(cameraSettings.frameRate)}fps
            </span>
          )}
          <button
            onClick={() => setShowCardPanel(!showCardPanel)}
            className={`p-2 rounded ${showCardPanel ? 'bg-mesa-gold text-white' : 'bg-mesa-card text-mesa-text hover:bg-mesa-border'}`}
            title="Card lookup"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded bg-mesa-card text-mesa-text hover:bg-mesa-border"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={leaveRoom}
            className="p-2 rounded bg-mesa-red/20 text-mesa-red hover:bg-mesa-red/30"
            title="Leave room"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Game area */}
        <div className="flex-1 p-4 flex gap-4">
          <div className="flex-1">
            <GameLayout
              localPlayer={localPlayer}
              remotePlayers={remotePlayers}
              onLifeChange={handleLifeChange}
              onPoisonChange={handlePoisonChange}
              onToggleMute={toggleAudio}
              onToggleVideo={toggleVideo}
            />
          </div>

          {/* Side panel - Life counter */}
          <div className="w-64 flex-shrink-0">
            <LifeCounter
              life={myLife}
              poison={myPoison}
              startingLife={state.startingLife}
              onLifeChange={setMyLife}
              onPoisonChange={setMyPoison}
              commanderDamage={commanderDamage}
              onCommanderDamageChange={handleCommanderDamageChange}
              opponents={opponents}
            />
          </div>
        </div>

        {/* Card panel */}
        <CardPanel isOpen={showCardPanel} onClose={() => setShowCardPanel(false)} />
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-mesa-surface rounded-lg p-6 w-96 border border-mesa-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-mesa-text font-semibold">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-mesa-text-secondary hover:text-mesa-text"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-mesa-text text-sm mb-2">Camera</label>
                <select
                  onChange={(e) => switchCamera(e.target.value)}
                  className="w-full bg-mesa-dark border border-mesa-border rounded px-3 py-2 text-mesa-text text-sm"
                >
                  {devices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-mesa-text text-sm mb-2">Format</label>
                <p className="text-mesa-text-secondary text-sm capitalize">{state.format}</p>
              </div>

              <div>
                <label className="block text-mesa-text text-sm mb-2">Starting Life</label>
                <p className="text-mesa-text-secondary text-sm">{state.startingLife}</p>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full mt-6 bg-mesa-gold text-white py-2 rounded hover:bg-mesa-gold/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
