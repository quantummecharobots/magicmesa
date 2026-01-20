import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Video, VideoOff, Maximize2, Scan, FlipHorizontal2, FlipVertical2 } from 'lucide-react'

interface CaptureOptions {
  clickPos?: { x: number; y: number }
  flipped?: boolean
  mirrored?: boolean
  playerId?: string
}

interface VideoFeedProps {
  stream: MediaStream | null
  playerId: string
  name: string
  life: number
  poison: number
  commanderDamage?: Record<string, number>
  isLocal?: boolean
  isMuted?: boolean
  seat: number
  onLifeChange?: (delta: number) => void
  onPoisonChange?: (delta: number) => void
  onToggleMute?: () => void
  onToggleVideo?: () => void
  onToggleMirror?: () => void
  onToggleFlip?: () => void
  onFullscreen?: () => void
  onCaptureCard?: (videoElement: HTMLVideoElement, options?: CaptureOptions) => void
  onFocusPlayer?: () => void
  audioEnabled?: boolean
  videoEnabled?: boolean
  mirrored?: boolean
  flipped?: boolean
  isProcessing?: boolean
  isVictorious?: boolean
}

export function VideoFeed({
  stream,
  playerId,
  name,
  life,
  poison,
  commanderDamage,
  isLocal = false,
  isMuted = false,
  seat,
  onLifeChange,
  onPoisonChange,
  onToggleMute,
  onToggleVideo,
  onToggleMirror,
  onToggleFlip,
  onFullscreen,
  onCaptureCard,
  onFocusPlayer,
  audioEnabled = true,
  videoEnabled = true,
  mirrored = false,
  flipped = false,
  isProcessing = false,
  isVictorious = false
}: VideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [justDefeated, setJustDefeated] = useState(false)
  const prevLifeRef = useRef<number>(life)
  // Capture area indicator state
  const [captureBox, setCaptureBox] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    console.log(`[VideoFeed] ${name}: stream=${stream ? 'yes' : 'no'}, isLocal=${isLocal}`)
    if (videoRef.current && stream) {
      console.log(`[VideoFeed] ${name}: Setting srcObject with ${stream.getTracks().length} tracks`)
      videoRef.current.srcObject = stream
    }
  }, [stream, name, isLocal])

  // Calculate current dead state (life <= 0 OR poison >= 10 OR commander damage >= 21)
  const currentMaxCmdDmg = commanderDamage ? Math.max(0, ...Object.values(commanderDamage)) : 0
  const isCurrentlyDead = life <= 0 || poison >= 10 || currentMaxCmdDmg >= 21

  // Track when player becomes defeated (transition from alive to dead)
  const prevDeadRef = useRef(isCurrentlyDead)
  useEffect(() => {
    const wasAlive = !prevDeadRef.current
    const isNowDead = isCurrentlyDead

    console.log(`[VideoFeed] ${name}: dead state changed, wasAlive=${wasAlive}, isNowDead=${isNowDead}, life=${life}, poison=${poison}, cmdDmg=${currentMaxCmdDmg}`)

    // Always update the ref first
    prevDeadRef.current = isCurrentlyDead
    prevLifeRef.current = life

    if (wasAlive && isNowDead) {
      // Player just died - trigger the extended animation
      console.log(`[VideoFeed] ${name}: JUST DEFEATED - showing extended animation`)
      setJustDefeated(true)
      // After 8 seconds, switch to normal defeated state
      const timer = setTimeout(() => {
        setJustDefeated(false)
      }, 8000)
      return () => clearTimeout(timer)
    }
  }, [isCurrentlyDead, life, poison, currentMaxCmdDmg, name])

  // Seat glow classes with pulse animation for the ornate frame effect
  const seatGlowClasses = [
    'seat-glow-blue-pulse',
    'seat-glow-emerald-pulse',
    'seat-glow-amber-pulse',
    'seat-glow-purple-pulse'
  ]

  const handleVideoClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    // Card capture works on any video with a stream
    if (onCaptureCard && videoRef.current && stream && !isProcessing) {
      const video = videoRef.current
      const rect = video.getBoundingClientRect()

      // Get click position relative to video element (normalized 0-1)
      const elementClickX = (e.clientX - rect.left) / rect.width
      const elementClickY = (e.clientY - rect.top) / rect.height

      // Account for object-fit: cover - the video is scaled to fill the container
      // and may be cropped. We need to convert element coords to actual video coords.
      const videoAspect = video.videoWidth / video.videoHeight
      const elementAspect = rect.width / rect.height

      let videoClickX = elementClickX
      let videoClickY = elementClickY

      if (videoAspect > elementAspect) {
        // Video is wider than container - sides are cropped
        const visibleWidthRatio = elementAspect / videoAspect
        const cropOffset = (1 - visibleWidthRatio) / 2
        videoClickX = cropOffset + elementClickX * visibleWidthRatio
      } else {
        // Video is taller than container - top/bottom are cropped
        const visibleHeightRatio = videoAspect / elementAspect
        const cropOffset = (1 - visibleHeightRatio) / 2
        videoClickY = cropOffset + elementClickY * visibleHeightRatio
      }

      // For REMOTE players only: transform coordinates based on how we're viewing their video
      // This is needed because we send coords to them and they capture from raw video
      // For LOCAL: captureFrame handles the transformation, so don't do it here
      let finalClickX = videoClickX
      let finalClickY = videoClickY

      if (!isLocal) {
        // Remote player - transform coords to raw video space before sending
        if (flipped) {
          finalClickX = 1 - videoClickX
          finalClickY = 1 - videoClickY
        }
        if (mirrored) {
          finalClickX = 1 - finalClickX
        }
      }

      console.log('[VideoFeed] Click adjusted for object-cover:', {
        element: { x: elementClickX.toFixed(3), y: elementClickY.toFixed(3) },
        video: { x: videoClickX.toFixed(3), y: videoClickY.toFixed(3) },
        final: { x: finalClickX.toFixed(3), y: finalClickY.toFixed(3) },
        videoAspect: videoAspect.toFixed(2),
        elementAspect: elementAspect.toFixed(2),
        videoSize: { w: video.videoWidth, h: video.videoHeight },
        elementSize: { w: rect.width.toFixed(0), h: rect.height.toFixed(0) },
        isLocal,
        flipped,
        mirrored,
        playerId
      })

      // Show the capture box indicator (uses element coords for display)
      setCaptureBox({ x: elementClickX, y: elementClickY })

      const options: CaptureOptions = {
        clickPos: { x: finalClickX, y: finalClickY },
        playerId
      }
      console.log('[VideoFeed] Click options:', options)
      onCaptureCard(videoRef.current, options)
    }
  }

  // Clear capture box when processing completes
  useEffect(() => {
    if (!isProcessing && captureBox) {
      // Keep the box visible briefly after processing completes
      const timer = setTimeout(() => setCaptureBox(null), 500)
      return () => clearTimeout(timer)
    }
  }, [isProcessing, captureBox])

  const handleDoubleClick = () => {
    // Double-click to focus/enlarge this player's view
    if (onFocusPlayer) {
      onFocusPlayer()
    }
  }

  // Use the already computed dead state
  const isDead = isCurrentlyDead
  // Only apply grayscale after the initial defeat animation completes
  const showGrayscale = isDead && !justDefeated

  return (
    <div className={`relative h-full video-frame-ornate overflow-hidden ${seatGlowClasses[seat]} transition-all ${showGrayscale ? 'grayscale opacity-60' : ''}`}>
      {/* Death overlay */}
      {isDead && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          {justDefeated ? (
            <div className="text-8xl font-fantasy text-red-500 defeated-flash">DEFEATED</div>
          ) : (
            <div className="text-6xl font-fantasy text-mesa-red text-glow animate-pulse">DEFEATED</div>
          )}
        </div>
      )}
      {/* Victory overlay */}
      {isVictorious && !isDead && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none victory-overlay">
          <div className="text-7xl font-fantasy text-yellow-300 victory-glow">VICTORY</div>
        </div>
      )}
      {/* Corner studs */}
      <div className="video-corner-stud video-corner-stud--tl"></div>
      <div className="video-corner-stud video-corner-stud--tr"></div>
      <div className="video-corner-stud video-corner-stud--bl"></div>
      <div className="video-corner-stud video-corner-stud--br"></div>
      {/* Scanning indicator */}
      {isProcessing && (
        <div className="absolute top-2 right-2 bg-mesa-gold/90 px-2 py-1 rounded-full text-xs text-mesa-dark font-semibold flex items-center gap-1 z-10 animate-pulse">
          <Scan className="w-3 h-3" />
          <span>Scanning...</span>
        </div>
      )}
      <video
        onClick={handleVideoClick}
        onDoubleClick={handleDoubleClick}
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal || isMuted}
        className={`w-full h-full object-cover video-playmat ${onCaptureCard ? 'cursor-pointer' : ''} ${isLocal && mirrored ? 'video-mirrored' : ''} ${flipped ? 'video-flipped' : ''}`}
        title={onCaptureCard ? 'Click to scan card, double-click to enlarge' : 'Double-click to enlarge'}
      />

      {/* Capture area indicator - 10% x 25% box (card-shaped) centered on click */}
      {captureBox && (
        <div
          className="absolute pointer-events-none z-10 border-2 border-red-500 bg-red-500/10 transition-opacity"
          style={{
            width: '10%',
            height: '25%',
            left: `${Math.max(0, Math.min(90, captureBox.x * 100 - 5))}%`,
            top: `${Math.max(0, Math.min(75, captureBox.y * 100 - 12.5))}%`,
          }}
        >
          {/* Corner markers */}
          <div className="absolute -top-0.5 -left-0.5 w-3 h-3 border-t-2 border-l-2 border-red-500" />
          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 border-t-2 border-r-2 border-red-500" />
          <div className="absolute -bottom-0.5 -left-0.5 w-3 h-3 border-b-2 border-l-2 border-red-500" />
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 border-b-2 border-r-2 border-red-500" />
        </div>
      )}

      {/* Player name badge */}
      <div className="absolute top-2 left-2 player-badge-ornate px-3 py-1 rounded-full text-sm text-mesa-text z-[5]">
        {name} {isLocal && '(You)'}
      </div>

      {/* Life counter overlay */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between z-[5]">
        <div className="flex items-center gap-2">
          {/* Life */}
          <div className="panel rounded-lg px-3 py-2 flex items-center gap-2">
            {isLocal && onLifeChange && (
              <button
                onClick={() => onLifeChange(-1)}
                className="w-6 h-6 rounded bg-mesa-red/30 hover:bg-mesa-red/50 text-mesa-red text-sm font-bold transition-colors"
              >
                -
              </button>
            )}
            <div className="text-center min-w-[40px]">
              <div className="text-2xl font-bold text-mesa-text font-fantasy text-glow">{life}</div>
              <div className="text-xs text-mesa-text-secondary">Life</div>
            </div>
            {isLocal && onLifeChange && (
              <button
                onClick={() => onLifeChange(1)}
                className="w-6 h-6 rounded bg-mesa-green/30 hover:bg-mesa-green/50 text-mesa-green text-sm font-bold transition-colors"
              >
                +
              </button>
            )}
          </div>

          {/* Poison */}
          {poison > 0 && (
            <div className="panel rounded-lg px-3 py-2 flex items-center gap-2">
              {isLocal && onPoisonChange && (
                <button
                  onClick={() => onPoisonChange(-1)}
                  className="w-5 h-5 rounded bg-mesa-red/30 hover:bg-mesa-red/50 text-mesa-red text-xs font-bold transition-colors"
                >
                  -
                </button>
              )}
              <div className="text-center">
                <div className="text-lg font-bold text-green-400 font-fantasy">{poison}</div>
                <div className="text-xs text-mesa-text-secondary">Poison</div>
              </div>
              {isLocal && onPoisonChange && (
                <button
                  onClick={() => onPoisonChange(1)}
                  className="w-5 h-5 rounded bg-green-500/30 hover:bg-green-500/50 text-green-400 text-xs font-bold transition-colors"
                >
                  +
                </button>
              )}
            </div>
          )}

          {/* Add poison button (only for local if poison is 0) */}
          {isLocal && poison === 0 && onPoisonChange && (
            <button
              onClick={() => onPoisonChange(1)}
              className="panel rounded-lg px-3 py-2 text-xs text-green-400 hover:bg-green-500/20 transition-colors"
            >
              + Poison
            </button>
          )}
        </div>

        {/* Controls for local player */}
        {isLocal && (
          <div className="flex gap-1">
            {onToggleMute && (
              <button
                onClick={onToggleMute}
                className={`btn-icon-ornate ${!audioEnabled ? 'active !bg-gradient-to-b !from-mesa-red !to-red-700 !border-mesa-red' : ''}`}
              >
                {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
            )}
            {onToggleVideo && (
              <button
                onClick={onToggleVideo}
                className={`btn-icon-ornate ${!videoEnabled ? 'active !bg-gradient-to-b !from-mesa-red !to-red-700 !border-mesa-red' : ''}`}
              >
                {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
            )}
            {onToggleMirror && (
              <button
                onClick={onToggleMirror}
                className={`btn-icon-ornate ${mirrored ? 'active' : ''}`}
                title="Mirror video (horizontal)"
              >
                <FlipHorizontal2 className="w-4 h-4" />
              </button>
            )}
            {onToggleFlip && (
              <button
                onClick={onToggleFlip}
                className={`btn-icon-ornate ${flipped ? 'active' : ''}`}
                title="Flip video (180° rotation)"
              >
                <FlipVertical2 className="w-4 h-4" />
              </button>
            )}
            {onFullscreen && (
              <button
                onClick={onFullscreen}
                className="btn-icon-ornate"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Flip control for remote players */}
        {!isLocal && onToggleFlip && (
          <div className="flex gap-1">
            <button
              onClick={onToggleFlip}
              className={`btn-icon-ornate ${flipped ? 'active' : ''}`}
              title="Flip video (180° rotation)"
            >
              <FlipVertical2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* No video placeholder */}
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-mesa-card z-0 pointer-events-none">
          <div className="text-center text-mesa-text-secondary">
            <VideoOff className="w-16 h-16 mx-auto mb-3 opacity-40 animate-pulse" />
            <p className="text-sm">Connecting video...</p>
          </div>
        </div>
      )}
    </div>
  )
}
