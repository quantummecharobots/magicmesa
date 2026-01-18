import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useCamera, RESOLUTIONS } from '../hooks/useCamera'
import { useWebRTC } from '../hooks/useWebRTC'
import { useCardRecognition } from '../hooks/useCardRecognition'
import { signaling, PlayerInfo } from '../lib/signaling'
import { GameLayout } from '../components/GameLayout'
import { CardPanel } from '../components/CardPanel'
import { LifeCounter } from '../components/LifeCounter'
import { Copy, Check, LogOut, Search, Settings, Users, RefreshCw } from 'lucide-react'

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

interface SavedSession {
  code: string
  name: string
  seat: number
  startingLife: number
  format: string
  isHost: boolean
  life: number
  poison: number
}

const SESSION_KEY = 'magicmesa_session'

function saveSession(session: SavedSession) {
  console.log('[Session] Saving session:', session)
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function loadSession(): SavedSession | null {
  const saved = sessionStorage.getItem(SESSION_KEY)
  console.log('[Session] Loading session:', saved)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      console.log('[Session] Parsed session:', parsed)
      return parsed
    } catch (e) {
      console.error('[Session] Failed to parse session:', e)
      return null
    }
  }
  return null
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

export function Room() {
  const { code } = useParams<{ code: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const locationState = location.state as LocationState | null

  // Always try to load session - we need it to detect refresh
  const savedSession = loadSession()

  // Detect refresh: we have session data for this room but signaling is not connected
  // This happens because React Router preserves locationState across refresh,
  // but the socket connection is lost
  const needsReconnect = savedSession?.code === code && !signaling.connected

  // Debug logging (can be removed in production)
  if (needsReconnect) {
    console.log('[Room] Detected page refresh, will reconnect to room:', code)
  }

  // Use location state, or restore from session if we need to reconnect
  const state = locationState || (needsReconnect && savedSession ? {
    name: savedSession.name,
    seat: savedSession.seat,
    startingLife: savedSession.startingLife,
    format: savedSession.format,
    isHost: savedSession.isHost,
    players: [] // Will be populated on rejoin
  } : null)

  const [players, setPlayers] = useState<Map<string, Player>>(new Map())
  const playersRef = useRef<Map<string, Player>>(new Map())
  const [myLife, setMyLife] = useState(savedSession?.life ?? state?.startingLife ?? 40)
  const [myPoison, setMyPoison] = useState(savedSession?.poison ?? 0)
  const [isRejoining, setIsRejoining] = useState(needsReconnect)
  const [commanderDamage, setCommanderDamage] = useState<Record<string, number>>({})
  const [copied, setCopied] = useState(false)
  const [showCardPanel, setShowCardPanel] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [recognizedCard, setRecognizedCard] = useState<string | undefined>(undefined)

  const {
    stream,
    startCamera,
    audioEnabled,
    videoEnabled,
    mirrored,
    toggleAudio,
    toggleVideo,
    toggleMirror,
    settings: cameraSettings,
    devices,
    switchCamera,
    currentResolution,
    changeResolution
  } = useCamera()

  const { peers, initiateConnection } = useWebRTC(stream)
  const { isProcessing, captureAndRecognize } = useCardRecognition()

  // Handle card capture on click
  const handleCaptureCard = useCallback(async (videoElement: HTMLVideoElement) => {
    const result = await captureAndRecognize(videoElement)
    // Always open panel, set card name if recognized
    setRecognizedCard(result?.cardName || undefined)
    setShowCardPanel(true)
  }, [captureAndRecognize])

  // Initialize camera on mount
  useEffect(() => {
    startCamera()
  }, [startCamera])

  // Store stream on signaling for WebRTC access
  useEffect(() => {
    signaling.localStream = stream
  }, [stream])

  // Save session to sessionStorage whenever relevant state changes
  useEffect(() => {
    if (state && code) {
      saveSession({
        code,
        name: state.name,
        seat: state.seat,
        startingLife: state.startingLife,
        format: state.format,
        isHost: state.isHost,
        life: myLife,
        poison: myPoison
      })
    }
  }, [state, code, myLife, myPoison])

  // Auto-rejoin room on refresh
  useEffect(() => {
    // Get the name to use - prefer locationState (has current data), fall back to savedSession
    const nameToUse = locationState?.name || savedSession?.name

    if (isRejoining && code && nameToUse) {
      console.log('[Room] Reconnecting to room after refresh...')
      const rejoin = async () => {
        try {
          await signaling.connect()
          const result = await signaling.joinRoom(code, nameToUse)
          console.log('[Room] Rejoined room successfully')

          // Update players from rejoin result
          const playerMap = new Map<string, Player>()
          result.players.forEach(p => {
            if (p.id !== signaling.id) {
              playerMap.set(p.id, { ...p, stream: null })
            }
          })
          setPlayers(playerMap)

          // Initiate connections to existing players
          setTimeout(() => {
            result.players.forEach(p => {
              if (p.id !== signaling.id) {
                console.log(`[Room] Initiating connection to ${p.name}`)
                initiateConnection(p.id)
              }
            })
          }, 500)

          setIsRejoining(false)
        } catch (err) {
          console.error('[Room] Failed to rejoin:', err)
          clearSession()
          navigate('/')
        }
      }
      rejoin()
    }
  }, [isRejoining, code, locationState?.name, savedSession?.name, navigate, initiateConnection])

  // Initialize existing players from join state
  useEffect(() => {
    if (state?.players && signaling.id) {
      console.log('[Room] Initializing players, my ID:', signaling.id)
      console.log('[Room] Players from state:', state.players.map(p => `${p.name}(${p.id})`))

      const playerMap = new Map<string, Player>()
      state.players.forEach(p => {
        if (p.id !== signaling.id) {
          console.log(`[Room] Adding remote player: ${p.name}`)
          playerMap.set(p.id, { ...p, stream: null })
        } else {
          console.log(`[Room] Skipping self: ${p.name}`)
        }
      })
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initializing players from join state on mount
      setPlayers(playerMap)

      // Initiate connections to existing players after a short delay
      const playersToConnect = state.players
      setTimeout(() => {
        playersToConnect?.forEach(p => {
          if (p.id !== signaling.id) {
            console.log(`[Room] Initiating connection to ${p.name}`)
            initiateConnection(p.id)
          }
        })
      }, 500)
    }
  }, [state?.players, initiateConnection])

  // Track pending removals for grace period
  const pendingRemovals = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Keep playersRef in sync with players state
  useEffect(() => {
    playersRef.current = players
  }, [players])

  // Handle new player joining
  useEffect(() => {
    const handlePlayerJoined = (data: PlayerInfo) => {
      console.log(`[Room] Player joined event: ${data.name} (${data.id})`)

      // Cancel any pending removal for a player with the same name (they're rejoining)
      // Use playersRef.current to access current state, not stale closure
      pendingRemovals.current.forEach((timeout, oldId) => {
        const existingPlayer = playersRef.current.get(oldId)
        if (existingPlayer?.name === data.name) {
          console.log(`[Room] Cancelling pending removal for ${data.name} (old ID: ${oldId})`)
          clearTimeout(timeout)
          pendingRemovals.current.delete(oldId)
          // Remove the old entry immediately
          setPlayers(prev => {
            const updated = new Map(prev)
            updated.delete(oldId)
            return updated
          })
        }
      })

      setPlayers(prev => {
        const updated = new Map(prev)
        updated.set(data.id, { ...data, stream: null })
        console.log(`[Room] Players now: ${updated.size}`)
        return updated
      })
      // Don't initiate connection here - the joining player will initiate to us
      console.log(`[Room] Waiting for ${data.name} to connect to us`)
    }

    const handlePlayerLeft = (data: { id: string }) => {
      const leavingPlayer = playersRef.current.get(data.id)
      console.log(`[Room] Player left: ${data.id} (${leavingPlayer?.name || 'unknown'}), waiting 5s before removing`)

      // Add a grace period before removing - they might be refreshing
      const timeout = setTimeout(() => {
        console.log(`[Room] Grace period expired, removing player ${data.id}`)
        setPlayers(prev => {
          const updated = new Map(prev)
          updated.delete(data.id)
          return updated
        })
        pendingRemovals.current.delete(data.id)
      }, 5000) // 5 second grace period

      pendingRemovals.current.set(data.id, timeout)
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
    console.log('[Room] Peers updated, checking streams:', peers.size, 'peers')
    peers.forEach((peer, peerId) => {
      console.log(`[Room] Peer ${peerId}: stream=${peer.stream ? 'yes' : 'no'}`)
    })

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing WebRTC peer streams to player state
    setPlayers(prev => {
      const updated = new Map(prev)
      let changed = false

      peers.forEach((peer, peerId) => {
        const player = updated.get(peerId)
        if (player) {
          if (peer.stream && player.stream !== peer.stream) {
            console.log(`[Room] Setting stream for player ${player.name}`)
            updated.set(peerId, { ...player, stream: peer.stream })
            changed = true
          }
        } else {
          console.log(`[Room] No player found for peer ${peerId}`)
        }
      })

      return changed ? updated : prev
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

  const handleCommanderDamageChange = useCallback((from: string, damage: number, lifeDelta: number) => {
    setCommanderDamage(prev => ({ ...prev, [from]: damage }))
    signaling.updateCommanderDamage(from, damage)

    // Apply commander damage to life total
    if (lifeDelta !== 0) {
      const newLife = myLife - lifeDelta
      setMyLife(newLife)
      signaling.updateLife(newLife)
    }
  }, [myLife])

  const copyRoomCode = async () => {
    if (code) {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const leaveRoom = () => {
    clearSession()
    signaling.disconnect()
    navigate('/')
  }

  // Show rejoining indicator
  if (isRejoining) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center panel-ornate p-8">
          <RefreshCw className="w-8 h-8 text-mesa-gold mx-auto mb-4 animate-spin" />
          <p className="text-mesa-text">Rejoining room...</p>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center panel-ornate p-8">
          <p className="text-mesa-text mb-4">Room session expired</p>
          <button
            onClick={() => navigate('/')}
            className="btn-gold-ornate"
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
    videoEnabled,
    mirrored,
    onCaptureCard: handleCaptureCard,
    isProcessing
  }

  const remotePlayers = Array.from(players.values())

  const opponents = remotePlayers.map(p => ({ id: p.id, name: p.name }))

  return (
    <div className="h-screen flex flex-col ambient-lantern">
      {/* Header with ornate styling */}
      <header className="header-ornate px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-mesa-gold font-bold text-xl font-fantasy text-glow">Magic Mesa</h1>
          <div className="flex items-center gap-2 panel border-glow px-3 py-1.5 rounded">
            <span className="text-mesa-text-secondary text-sm">Room:</span>
            <span className="text-mesa-gold font-mono font-bold tracking-wider font-fantasy">{code}</span>
            <button
              onClick={copyRoomCode}
              className="p-1 hover:bg-mesa-border rounded transition-colors"
              title="Copy room code"
            >
              {copied ? (
                <Check className="w-4 h-4 text-mesa-green" />
              ) : (
                <Copy className="w-4 h-4 text-mesa-text-secondary hover:text-mesa-gold" />
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
            className={`btn-icon-ornate ${showCardPanel ? 'active' : ''}`}
            title="Card lookup"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn-icon-ornate"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={leaveRoom}
            className="btn-icon-ornate hover:!border-mesa-red hover:!text-mesa-red"
            title="Leave room"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Game area with wooden frame and felt texture */}
        <div className="flex-1 p-4 flex gap-4">
          <div className="flex-1 frame-wooden felt-texture ambient-glow rounded-lg relative">
            {/* Corner flourishes */}
            <div className="frame-corner frame-corner--tl"></div>
            <div className="frame-corner frame-corner--tr"></div>
            <div className="frame-corner frame-corner--bl"></div>
            <div className="frame-corner frame-corner--br"></div>
            <GameLayout
              localPlayer={localPlayer}
              remotePlayers={remotePlayers}
              onLifeChange={handleLifeChange}
              onPoisonChange={handlePoisonChange}
              onToggleMute={toggleAudio}
              onToggleVideo={toggleVideo}
              onToggleMirror={toggleMirror}
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
        <CardPanel
          isOpen={showCardPanel}
          onClose={() => setShowCardPanel(false)}
          initialSearch={recognizedCard}
        />
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="panel-ornate p-6 w-96">
            <div className="flex items-center justify-between mb-4 panel-header">
              <h2 className="text-mesa-text font-semibold font-fantasy">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-mesa-text-secondary hover:text-mesa-gold text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-mesa-text text-sm mb-2">Camera</label>
                <select
                  onChange={(e) => switchCamera(e.target.value)}
                  className="select-ornate"
                >
                  {devices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-mesa-text text-sm mb-2">Resolution</label>
                <select
                  value={`${currentResolution.width}x${currentResolution.height}`}
                  onChange={(e) => {
                    const res = RESOLUTIONS.find(r => `${r.width}x${r.height}` === e.target.value)
                    if (res) changeResolution(res)
                  }}
                  className="select-ornate"
                >
                  {RESOLUTIONS.map(res => (
                    <option key={`${res.width}x${res.height}`} value={`${res.width}x${res.height}`}>
                      {res.label}
                    </option>
                  ))}
                </select>
                {cameraSettings && (
                  <p className="text-mesa-text-secondary text-xs mt-1">
                    Actual: {cameraSettings.width}x{cameraSettings.height}
                  </p>
                )}
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
              className="w-full mt-6 btn-gold-ornate"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
