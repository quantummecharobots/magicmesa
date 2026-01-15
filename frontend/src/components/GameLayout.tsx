import { VideoFeed } from './VideoFeed'

interface Player {
  id: string
  name: string
  seat: number
  life: number
  poison: number
  stream: MediaStream | null
}

interface GameLayoutProps {
  localPlayer: Player & {
    audioEnabled: boolean
    videoEnabled: boolean
  }
  remotePlayers: Player[]
  onLifeChange: (delta: number) => void
  onPoisonChange: (delta: number) => void
  onToggleMute: () => void
  onToggleVideo: () => void
}

export function GameLayout({
  localPlayer,
  remotePlayers,
  onLifeChange,
  onPoisonChange,
  onToggleMute,
  onToggleVideo
}: GameLayoutProps) {
  // Arrange players in commander-style layout:
  // Top row: opponents (seats 1, 2, 3 relative to local)
  // Bottom: local player (largest)

  const getOpponentsBySeat = () => {
    const opponents: (Player | null)[] = [null, null, null]
    remotePlayers.forEach(player => {
      // Map remote seats to display positions
      const relativePosition = (player.seat - localPlayer.seat + 4) % 4
      if (relativePosition > 0 && relativePosition <= 3) {
        opponents[relativePosition - 1] = player
      }
    })
    return opponents
  }

  const opponents = getOpponentsBySeat()

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Opponents row */}
      <div className="grid grid-cols-3 gap-3 flex-shrink-0">
        {opponents.map((opponent, index) => (
          <div key={index} className="aspect-video">
            {opponent && (
              <VideoFeed
                stream={opponent.stream}
                name={opponent.name}
                life={opponent.life}
                poison={opponent.poison}
                seat={opponent.seat}
                isMuted={false}
              />
            )}
          </div>
        ))}
      </div>

      {/* Local player (large) */}
      <div className="flex-1 min-h-0">
        <VideoFeed
          stream={localPlayer.stream}
          name={localPlayer.name}
          life={localPlayer.life}
          poison={localPlayer.poison}
          seat={localPlayer.seat}
          isLocal
          audioEnabled={localPlayer.audioEnabled}
          videoEnabled={localPlayer.videoEnabled}
          onLifeChange={onLifeChange}
          onPoisonChange={onPoisonChange}
          onToggleMute={onToggleMute}
          onToggleVideo={onToggleVideo}
        />
      </div>
    </div>
  )
}
