import { useEffect, useRef } from 'react'
import { Mic, MicOff, Video, VideoOff, Maximize2 } from 'lucide-react'

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
  onFullscreen?: () => void
  audioEnabled?: boolean
  videoEnabled?: boolean
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
  onFullscreen,
  audioEnabled = true,
  videoEnabled = true
}: VideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  const seatColors = [
    'border-blue-500',
    'border-green-500',
    'border-yellow-500',
    'border-purple-500'
  ]

  return (
    <div className={`relative bg-mesa-card rounded-lg overflow-hidden border-2 ${seatColors[seat]} transition-all`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal || isMuted}
        className="w-full h-full object-cover video-playmat"
      />

      {/* Player name badge */}
      <div className="absolute top-2 left-2 bg-black/70 px-3 py-1 rounded-full text-sm text-mesa-text">
        {name} {isLocal && '(You)'}
      </div>

      {/* Life counter overlay */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Life */}
          <div className="bg-black/70 rounded-lg px-3 py-2 flex items-center gap-2">
            {isLocal && onLifeChange && (
              <button
                onClick={() => onLifeChange(-1)}
                className="w-6 h-6 rounded bg-mesa-red/50 hover:bg-mesa-red text-white text-sm"
              >
                -
              </button>
            )}
            <div className="text-center min-w-[40px]">
              <div className="text-2xl font-bold text-mesa-text">{life}</div>
              <div className="text-xs text-mesa-text-secondary">Life</div>
            </div>
            {isLocal && onLifeChange && (
              <button
                onClick={() => onLifeChange(1)}
                className="w-6 h-6 rounded bg-mesa-green/50 hover:bg-mesa-green text-white text-sm"
              >
                +
              </button>
            )}
          </div>

          {/* Poison */}
          {poison > 0 && (
            <div className="bg-black/70 rounded-lg px-3 py-2 flex items-center gap-2">
              {isLocal && onPoisonChange && (
                <button
                  onClick={() => onPoisonChange(-1)}
                  className="w-5 h-5 rounded bg-mesa-red/50 hover:bg-mesa-red text-white text-xs"
                >
                  -
                </button>
              )}
              <div className="text-center">
                <div className="text-lg font-bold text-green-400">{poison}</div>
                <div className="text-xs text-mesa-text-secondary">Poison</div>
              </div>
              {isLocal && onPoisonChange && (
                <button
                  onClick={() => onPoisonChange(1)}
                  className="w-5 h-5 rounded bg-green-500/50 hover:bg-green-500 text-white text-xs"
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
              className="bg-black/70 rounded-lg px-3 py-2 text-xs text-green-400 hover:bg-green-500/20"
            >
              + Poison
            </button>
          )}
        </div>

        {/* Controls */}
        {isLocal && (
          <div className="flex gap-1">
            {onToggleMute && (
              <button
                onClick={onToggleMute}
                className={`p-2 rounded ${audioEnabled ? 'bg-black/70 text-mesa-text' : 'bg-mesa-red text-white'}`}
              >
                {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
            )}
            {onToggleVideo && (
              <button
                onClick={onToggleVideo}
                className={`p-2 rounded ${videoEnabled ? 'bg-black/70 text-mesa-text' : 'bg-mesa-red text-white'}`}
              >
                {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
            )}
            {onFullscreen && (
              <button
                onClick={onFullscreen}
                className="p-2 rounded bg-black/70 text-mesa-text hover:bg-black"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
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
