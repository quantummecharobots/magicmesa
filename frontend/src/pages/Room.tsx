import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useCamera, RESOLUTIONS } from '../hooks/useCamera'
import { useWebRTC } from '../hooks/useWebRTC'
import { useCardRecognition, type CaptureOptions } from '../hooks/useCardRecognition'
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
  commanderDamage: Record<string, number>
  scannedCards: string[]
}

const SESSION_KEY = 'magicmesa_session'

function saveSession(session: SavedSession) {
  console.log('[Session] Saving session:', session)
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function loadSession(): SavedSession | null {
  const saved = localStorage.getItem(SESSION_KEY)
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
  localStorage.removeItem(SESSION_KEY)
}

export function Room() {
  const { code } = useParams<{ code: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const locationState = location.state as LocationState | null

  // Always try to load session - we need it to detect refresh
  const loadedSession = loadSession()
  // Only use saved session if it matches the current room
  const savedSession = loadedSession?.code === code ? loadedSession : null

  // Detect refresh: we have session data for this room but signaling is not connected
  // This happens because React Router preserves locationState across refresh,
  // but the socket connection is lost
  const needsReconnect = savedSession && !signaling.connected

  // Debug logging (can be removed in production)
  if (needsReconnect) {
    console.log('[Room] Detected page refresh, will reconnect to room:', code)
    console.log('[Room] Restoring state - life:', savedSession.life, 'poison:', savedSession.poison)
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
  const [isRejoining, setIsRejoining] = useState(!!needsReconnect)
  const [commanderDamage, setCommanderDamage] = useState<Record<string, number>>(savedSession?.commanderDamage ?? {})
  const [scannedCards, setScannedCards] = useState<string[]>(savedSession?.scannedCards ?? [])
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
    flipped,
    toggleAudio,
    toggleVideo,
    toggleMirror,
    toggleFlip,
    settings: cameraSettings,
    devices,
    audioInputDevices,
    audioOutputDevices,
    currentAudioInput,
    currentAudioOutput,
    switchCamera,
    switchMicrophone,
    setAudioOutput,
    currentResolution,
    changeResolution,
    focusCapabilities,
    focusDistance,
    focusMode,
    setFocusMode,
    setFocusDistance
  } = useCamera()

  const { peers, initiateConnection } = useWebRTC(stream)
  const { isProcessing, captureAndRecognize } = useCardRecognition()

  // Ref to local video element for responding to remote scan requests
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  // Ref to local stream for scan request handler (avoids stale closure)
  const streamRef = useRef<MediaStream | null>(null)
  // Pending scan state - when waiting for remote response
  const [pendingRemoteScan, setPendingRemoteScan] = useState(false)

  // Keep streamRef in sync with stream
  useEffect(() => {
    streamRef.current = stream
    console.log('[Room] Stream updated:', stream ? `${stream.getTracks().length} tracks` : 'null')
  }, [stream])

  // Handle card capture on click - options include click position and flip/mirror state
  // If playerId is provided and it's not us, request the scan from that player
  const handleCaptureCard = useCallback(async (videoElement: HTMLVideoElement, options?: CaptureOptions & { playerId?: string }) => {
    console.log('[Room] handleCaptureCard called, playerId:', options?.playerId, 'myId:', signaling.id)

    const isRemotePlayer = options?.playerId && options.playerId !== signaling.id

    if (isRemotePlayer) {
      // Request the card owner to scan from their local camera
      console.log('[Room] Requesting remote scan from:', options.playerId)
      setPendingRemoteScan(true)
      signaling.requestCardScan(options.playerId!, options.clickPos || { x: 0.5, y: 0.5 })
      return // Wait for response via event listener
    }

    // Local capture
    try {
      // Store ref to local video for remote scan requests
      if (!isRemotePlayer) {
        localVideoRef.current = videoElement
      }

      // Add our flip/mirror state to the options
      const captureOptions: CaptureOptions = {
        ...options,
        flipped: options?.flipped ?? flipped,
        mirrored: options?.mirrored ?? mirrored
      }
      const result = await captureAndRecognize(videoElement, captureOptions)
      console.log('[Room] Card recognition result:', result)
      // Always open panel, set card name if recognized
      const cardName = result?.cardName || undefined
      setRecognizedCard(cardName)
      setShowCardPanel(true)
      // Add to scanned cards history if recognized
      if (cardName) {
        setScannedCards(prev => {
          // Avoid duplicates, keep most recent first, limit to 20
          const filtered = prev.filter(c => c !== cardName)
          return [cardName, ...filtered].slice(0, 20)
        })
      }
    } catch (err) {
      console.error('[Room] Card capture error:', err)
      // Still open the panel even on error
      setRecognizedCard(undefined)
      setShowCardPanel(true)
    }
  }, [captureAndRecognize, flipped, mirrored])

  // Initialize camera on mount
  useEffect(() => {
    startCamera()
  }, [startCamera])

  // Store stream on signaling for WebRTC access
  useEffect(() => {
    signaling.localStream = stream
  }, [stream])

  // Save session to localStorage whenever relevant state changes
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
        poison: myPoison,
        commanderDamage,
        scannedCards
      })
    }
  }, [state, code, myLife, myPoison, commanderDamage, scannedCards])

  // Track if we're currently in the process of rejoining to prevent double execution
  const isRejoiningRef = useRef(false)

  // Auto-rejoin room on refresh
  useEffect(() => {
    // Get the name to use - prefer locationState (has current data), fall back to savedSession
    const nameToUse = locationState?.name || savedSession?.name

    // Guard against double execution (React StrictMode or rapid re-renders)
    if (isRejoining && code && nameToUse && !isRejoiningRef.current) {
      isRejoiningRef.current = true
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
          isRejoiningRef.current = false
        } catch (err) {
          console.error('[Room] Failed to rejoin:', err)
          isRejoiningRef.current = false
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
      console.log(`[Room] Received life-updated: player=${data.playerId}, life=${data.life}`)
      setPlayers(prev => {
        const updated = new Map(prev)
        const player = updated.get(data.playerId)
        if (player) {
          console.log(`[Room] Updating ${player.name}'s life: ${player.life} -> ${data.life}`)
          updated.set(data.playerId, { ...player, life: data.life })
        } else {
          console.log(`[Room] Player ${data.playerId} not found in players map`)
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

  // Handle remote card scan requests and responses
  useEffect(() => {
    // When another player requests us to scan a card from our camera
    const handleScanRequest = async (data: { requesterId: string; clickPos: { x: number; y: number } }) => {
      console.log('[Room] Received scan request from:', data.requesterId, 'at position:', data.clickPos)

      // Use ref to get current stream (avoids stale closure)
      const currentStream = streamRef.current
      console.log('[Room] Current stream for scan:', currentStream ? `${currentStream.getTracks().length} tracks, active=${currentStream.active}` : 'null')

      if (!currentStream) {
        console.log('[Room] No local stream for scan request - sending null result')
        signaling.sendCardScanResult(data.requesterId, null)
        return
      }

      // Check if stream has active video track
      const videoTracks = currentStream.getVideoTracks()
      console.log('[Room] Video tracks:', videoTracks.length, videoTracks.map(t => `${t.label} enabled=${t.enabled} readyState=${t.readyState}`))

      if (videoTracks.length === 0 || !videoTracks[0].enabled) {
        console.log('[Room] No active video track for scan request')
        signaling.sendCardScanResult(data.requesterId, null)
        return
      }

      try {
        // Create a temporary video element to capture from our stream
        const tempVideo = document.createElement('video')
        tempVideo.srcObject = currentStream
        tempVideo.muted = true
        tempVideo.playsInline = true

        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          tempVideo.onloadedmetadata = () => {
            console.log('[Room] Temp video metadata loaded:', tempVideo.videoWidth, 'x', tempVideo.videoHeight)
            tempVideo.play().then(() => resolve()).catch(reject)
          }
          tempVideo.onerror = (e) => {
            console.error('[Room] Temp video error:', e)
            reject(e)
          }
          // Timeout after 5 seconds
          setTimeout(() => reject(new Error('Video load timeout')), 5000)
        })

        // Give it a moment to actually render frames
        await new Promise(resolve => setTimeout(resolve, 100))

        console.log('[Room] Capturing from local stream for remote request, video ready:', tempVideo.videoWidth, 'x', tempVideo.videoHeight)

        // Capture and recognize the card at the click position
        // For remote requests:
        // - Coordinates come pre-transformed from the requester (based on how they view our video)
        // - We DO apply our flip/mirror to the OUTPUT IMAGE so it appears right-side up
        // - But we set applyToCoords: false so the coords aren't double-transformed
        const result = await captureAndRecognize(tempVideo, {
          clickPos: data.clickPos,
          flipped,
          mirrored,
          applyFlipToCoords: false  // Coords already transformed by requester
        })

        console.log('[Room] Scan result for remote request:', result)

        // Send result back to requester
        signaling.sendCardScanResult(data.requesterId, result?.cardName || null)

        // Clean up
        tempVideo.srcObject = null
      } catch (err) {
        console.error('[Room] Error processing scan request:', err)
        signaling.sendCardScanResult(data.requesterId, null)
      }
    }

    // When we receive a scan response from a remote player
    const handleScanResponse = (data: { cardName: string | null }) => {
      console.log('[Room] Received scan response:', data.cardName)
      setPendingRemoteScan(false)

      // Open the card panel with the result
      const cardName = data.cardName || undefined
      setRecognizedCard(cardName)
      setShowCardPanel(true)

      // Add to scanned cards history if recognized
      if (cardName) {
        setScannedCards(prev => {
          // Avoid duplicates, keep most recent first, limit to 20
          const filtered = prev.filter(c => c !== cardName)
          return [cardName, ...filtered].slice(0, 20)
        })
      }
    }

    signaling.on('scan-card-request', handleScanRequest as (...args: unknown[]) => void)
    signaling.on('scan-card-response', handleScanResponse as (...args: unknown[]) => void)

    return () => {
      signaling.off('scan-card-request', handleScanRequest as (...args: unknown[]) => void)
      signaling.off('scan-card-response', handleScanResponse as (...args: unknown[]) => void)
    }
  }, [flipped, mirrored, captureAndRecognize]) // Note: uses streamRef instead of stream to avoid stale closures

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
  }, [peers, players])

  // Retry connections for players without streams
  useEffect(() => {
    const retryInterval = setInterval(() => {
      players.forEach((player, peerId) => {
        if (!player.stream && !peers.has(peerId)) {
          console.log(`[Room] Retrying connection to ${player.name} (no stream, no peer)`)
          initiateConnection(peerId)
        }
      })
    }, 5000) // Retry every 5 seconds

    return () => clearInterval(retryInterval)
  }, [players, peers, initiateConnection])

  const handleLifeChange = useCallback((delta: number) => {
    const newLife = myLife + delta
    setMyLife(newLife)
    signaling.updateLife(newLife)
  }, [myLife])

  // For LifeCounter which passes absolute values
  const handleLifeSet = useCallback((newLife: number) => {
    setMyLife(newLife)
    signaling.updateLife(newLife)
  }, [])

  const handlePoisonChange = useCallback((delta: number) => {
    const newPoison = Math.max(0, myPoison + delta)
    setMyPoison(newPoison)
    signaling.updatePoison(newPoison)
  }, [myPoison])

  // For LifeCounter which passes absolute values
  const handlePoisonSet = useCallback((newPoison: number) => {
    setMyPoison(newPoison)
    signaling.updatePoison(newPoison)
  }, [])

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
    commanderDamage,
    stream,
    audioEnabled,
    videoEnabled,
    mirrored,
    flipped,
    onCaptureCard: handleCaptureCard,
    isProcessing: isProcessing || pendingRemoteScan
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
          <div className="flex-1 frame-wooden felt-texture ambient-glow rounded-lg relative overflow-hidden">
            {/* Corner flourishes */}
            <div className="frame-corner frame-corner--tl"></div>
            <div className="frame-corner frame-corner--tr"></div>
            <div className="frame-corner frame-corner--bl"></div>
            <div className="frame-corner frame-corner--br"></div>
            <div className="absolute inset-0 p-3">
              <GameLayout
                localPlayer={localPlayer}
                remotePlayers={remotePlayers}
                onLifeChange={handleLifeChange}
                onPoisonChange={handlePoisonChange}
                onToggleMute={toggleAudio}
                onToggleVideo={toggleVideo}
                onToggleMirror={toggleMirror}
                onToggleFlip={toggleFlip}
              />
            </div>
          </div>

          {/* Side panel - Life counter */}
          <div className="w-64 flex-shrink-0">
            <LifeCounter
              life={myLife}
              poison={myPoison}
              startingLife={state.startingLife}
              onLifeChange={handleLifeSet}
              onPoisonChange={handlePoisonSet}
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

              {audioInputDevices.length > 0 && (
                <div>
                  <label className="block text-mesa-text text-sm mb-2">Microphone</label>
                  <select
                    value={currentAudioInput || ''}
                    onChange={(e) => switchMicrophone(e.target.value)}
                    className="select-ornate"
                  >
                    {audioInputDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {audioOutputDevices.length > 0 && (
                <div>
                  <label className="block text-mesa-text text-sm mb-2">Speakers</label>
                  <select
                    value={currentAudioOutput || ''}
                    onChange={(e) => setAudioOutput(e.target.value)}
                    className="select-ornate"
                  >
                    {audioOutputDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Focus Control */}
              <div>
                <label className="block text-mesa-text text-sm mb-2">Camera Focus</label>
                {focusCapabilities?.supported ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFocusMode('continuous')}
                        className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
                          focusMode === 'continuous'
                            ? 'bg-mesa-gold text-mesa-dark'
                            : 'bg-mesa-card text-mesa-text hover:bg-mesa-border'
                        }`}
                      >
                        Auto
                      </button>
                      <button
                        onClick={() => setFocusMode('manual')}
                        className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
                          focusMode === 'manual'
                            ? 'bg-mesa-gold text-mesa-dark'
                            : 'bg-mesa-card text-mesa-text hover:bg-mesa-border'
                        }`}
                      >
                        Manual
                      </button>
                    </div>
                    {focusMode === 'manual' && (
                      <div>
                        <input
                          type="range"
                          min={focusCapabilities.min}
                          max={focusCapabilities.max}
                          step={focusCapabilities.step}
                          value={focusDistance ?? focusCapabilities.min}
                          onChange={(e) => setFocusDistance(parseFloat(e.target.value))}
                          className="w-full accent-mesa-gold"
                        />
                        <div className="flex justify-between text-xs text-mesa-text-secondary">
                          <span>Near</span>
                          <span>{focusDistance?.toFixed(2) ?? '-'}</span>
                          <span>Far</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-mesa-text-secondary text-sm">Manual focus not supported by this camera</p>
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
