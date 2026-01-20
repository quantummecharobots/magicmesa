import { useState } from 'react'
import { VideoFeed } from './VideoFeed'

interface Player {
  id: string
  name: string
  seat: number
  life: number
  poison: number
  stream: MediaStream | null
  commanderDamage?: Record<string, number>  // Damage received from each opponent
}

interface GameLayoutProps {
  localPlayer: Player & {
    audioEnabled: boolean
    videoEnabled: boolean
    mirrored: boolean
    flipped: boolean
    onCaptureCard?: (videoElement: HTMLVideoElement) => void
    isProcessing?: boolean
  }
  remotePlayers: Player[]
  onLifeChange: (delta: number) => void
  onPoisonChange: (delta: number) => void
  onToggleMute: () => void
  onToggleVideo: () => void
  onToggleMirror: () => void
  onToggleFlip: () => void
}

export function GameLayout({
  localPlayer,
  remotePlayers,
  onLifeChange,
  onPoisonChange,
  onToggleMute,
  onToggleVideo,
  onToggleMirror,
  onToggleFlip
}: GameLayoutProps) {
  // Track which player is in the large view (null = local player)
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null)
  // Track flip state for remote players (local-only, not synced)
  const [remoteFlipStates, setRemoteFlipStates] = useState<Record<string, boolean>>({})

  const toggleRemoteFlip = (playerId: string) => {
    setRemoteFlipStates(prev => ({
      ...prev,
      [playerId]: !prev[playerId]
    }))
  }

  // Arrange players in commander-style layout:
  // Top row: opponents (seats 1, 2, 3 relative to local)
  // Bottom: focused player (largest)

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

  // Helper to check if a player is dead (life <= 0 OR 10+ poison OR 21+ commander damage from any single source)
  const isPlayerDead = (player: Player): boolean => {
    if (player.life <= 0) return true
    if (player.poison >= 10) return true
    if (player.commanderDamage) {
      const maxCommanderDamage = Math.max(0, ...Object.values(player.commanderDamage))
      if (maxCommanderDamage >= 21) return true
    }
    return false
  }

  // Calculate victory state - a player wins if they're alive and all opponents are dead
  const allPlayers = [localPlayer, ...remotePlayers]
  const alivePlayers = allPlayers.filter(p => !isPlayerDead(p))
  const deadPlayers = allPlayers.filter(p => isPlayerDead(p))

  // Victory requires: exactly one player alive, at least one player dead
  const hasVictory = alivePlayers.length === 1 && deadPlayers.length > 0
  const victorId = hasVictory ? alivePlayers[0].id : null

  // Get the focused player (default to local)
  const focusedPlayer = focusedPlayerId
    ? remotePlayers.find(p => p.id === focusedPlayerId) || localPlayer
    : localPlayer

  const isFocusedLocal = focusedPlayer.id === localPlayer.id

  // Build list of players for the small row (exclude focused player)
  const smallRowPlayers: (Player | null)[] = []

  // Add opponents to small row (if not focused)
  opponents.forEach((opponent) => {
    if (opponent && opponent.id !== focusedPlayerId) {
      smallRowPlayers.push(opponent)
    } else if (!opponent) {
      smallRowPlayers.push(null) // Empty slot
    }
  })

  // If a remote player is focused, add local player to small row
  if (!isFocusedLocal) {
    smallRowPlayers.push(localPlayer)
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Small players row */}
      <div className="grid grid-cols-3 gap-3 flex-shrink-0">
        {smallRowPlayers.slice(0, 3).map((player, index) => (
          <div key={player?.id || `empty-${index}`} className="aspect-video">
            {player && (
              <VideoFeed
                stream={player.stream}
                playerId={player.id}
                name={player.name}
                life={player.life}
                poison={player.poison}
                commanderDamage={player.commanderDamage}
                seat={player.seat}
                isLocal={player.id === localPlayer.id}
                isMuted={false}
                audioEnabled={player.id === localPlayer.id ? localPlayer.audioEnabled : undefined}
                videoEnabled={player.id === localPlayer.id ? localPlayer.videoEnabled : undefined}
                mirrored={player.id === localPlayer.id ? localPlayer.mirrored : false}
                flipped={player.id === localPlayer.id ? localPlayer.flipped : remoteFlipStates[player.id] || false}
                onToggleFlip={player.id === localPlayer.id ? undefined : () => toggleRemoteFlip(player.id)}
                onCaptureCard={localPlayer.onCaptureCard}
                onFocusPlayer={() => setFocusedPlayerId(player.id === localPlayer.id ? null : player.id)}
                isProcessing={localPlayer.isProcessing}
                isVictorious={victorId === player.id}
              />
            )}
          </div>
        ))}
      </div>

      {/* Focused player (large) */}
      <div className="flex-1 min-h-0">
        <VideoFeed
          stream={focusedPlayer.stream}
          playerId={focusedPlayer.id}
          name={focusedPlayer.name}
          life={focusedPlayer.life}
          poison={focusedPlayer.poison}
          commanderDamage={focusedPlayer.commanderDamage}
          seat={focusedPlayer.seat}
          isLocal={isFocusedLocal}
          isMuted={false}
          audioEnabled={isFocusedLocal ? localPlayer.audioEnabled : undefined}
          videoEnabled={isFocusedLocal ? localPlayer.videoEnabled : undefined}
          mirrored={isFocusedLocal ? localPlayer.mirrored : false}
          flipped={isFocusedLocal ? localPlayer.flipped : remoteFlipStates[focusedPlayer.id] || false}
          onLifeChange={isFocusedLocal ? onLifeChange : undefined}
          onPoisonChange={isFocusedLocal ? onPoisonChange : undefined}
          onToggleMute={isFocusedLocal ? onToggleMute : undefined}
          onToggleVideo={isFocusedLocal ? onToggleVideo : undefined}
          onToggleMirror={isFocusedLocal ? onToggleMirror : undefined}
          onToggleFlip={isFocusedLocal ? onToggleFlip : () => toggleRemoteFlip(focusedPlayer.id)}
          onCaptureCard={localPlayer.onCaptureCard}
          onFocusPlayer={() => setFocusedPlayerId(null)}
          isProcessing={localPlayer.isProcessing}
          isVictorious={victorId === focusedPlayer.id}
        />
      </div>
    </div>
  )
}
