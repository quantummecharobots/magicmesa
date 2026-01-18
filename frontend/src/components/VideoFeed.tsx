import { useEffect, useRef } from 'react'
import { Mic, MicOff, Video, VideoOff, Maximize2, Scan, FlipHorizontal2, FlipVertical2 } from 'lucide-react'

interface VideoFeedProps {
  stream: MediaStream | null
  name: string
  life: number
  poison: number
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
  onCaptureCard?: (videoElement: HTMLVideoElement) => void
  onFocusPlayer?: () => void
  audioEnabled?: boolean
  videoEnabled?: boolean
  mirrored?: boolean
  flipped?: boolean
  isProcessing?: boolean
}

export function VideoFeed({
  stream,
  name,
  life,
  poison,
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
  isProcessing = false
}: VideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    console.log(`[VideoFeed] ${name}: stream=${stream ? 'yes' : 'no'}, isLocal=${isLocal}`)
    if (videoRef.current && stream) {
      console.log(`[VideoFeed] ${name}: Setting srcObject with ${stream.getTracks().length} tracks`)
      videoRef.current.srcObject = stream
    }
  }, [stream, name, isLocal])

  // Seat glow classes with pulse animation for the ornate frame effect
  const seatGlowClasses = [
    'seat-glow-blue-pulse',
    'seat-glow-emerald-pulse',
    'seat-glow-amber-pulse',
    'seat-glow-purple-pulse'
  ]

  const handleVideoClick = () => {
    // Card capture works on any video with a stream
    if (onCaptureCard && videoRef.current && stream && !isProcessing) {
      onCaptureCard(videoRef.current)
    }
  }

  const handleDoubleClick = () => {
    // Double-click to focus/enlarge this player's view
    if (onFocusPlayer) {
      onFocusPlayer()
    }
  }

  const isDead = life <= 0

  return (
    <div className={`relative video-frame-ornate overflow-hidden ${seatGlowClasses[seat]} transition-all ${isDead ? 'grayscale opacity-60' : ''}`}>
      {/* Death overlay */}
      {isDead && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="text-6xl font-fantasy text-mesa-red text-glow animate-pulse">DEFEATED</div>
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

      {/* Player name badge */}
      <div className="absolute top-2 left-2 player-badge-ornate px-3 py-1 rounded-full text-sm text-mesa-text">
        {name} {isLocal && '(You)'}
      </div>

      {/* Life counter overlay */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
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
            {onCaptureCard && (
              <button
                onClick={() => videoRef.current && onCaptureCard(videoRef.current)}
                disabled={!stream || isProcessing}
                className={`btn-icon-ornate ${isProcessing ? 'animate-pulse' : ''}`}
                title="Scan card"
              >
                <Scan className="w-4 h-4" />
              </button>
            )}
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
        <div className="absolute inset-0 flex items-center justify-center bg-mesa-card">
          <div className="text-center text-mesa-text-secondary">
            <VideoOff className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Waiting for video...</p>
          </div>
        </div>
      )}
    </div>
  )
}
