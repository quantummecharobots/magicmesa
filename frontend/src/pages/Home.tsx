import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signaling } from '../lib/signaling'
import { Users, Play, ArrowRight } from 'lucide-react'

export function Home() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [format, setFormat] = useState('commander')
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }

    setIsCreating(true)
    setError('')

    try {
      await signaling.connect()
      const { code, seat, startingLife } = await signaling.createRoom(name.trim(), format)
      navigate(`/room/${code}`, {
        state: { name: name.trim(), seat, startingLife, format, isHost: true }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room')
      setIsCreating(false)
    }
  }

  const handleJoin = async () => {
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }
    if (!joinCode.trim()) {
      setError('Please enter a room code')
      return
    }

    setIsJoining(true)
    setError('')

    try {
      await signaling.connect()
      const roomState = await signaling.joinRoom(joinCode.trim(), name.trim())
      navigate(`/room/${roomState.code}`, {
        state: {
          name: name.trim(),
          seat: roomState.seat,
          startingLife: roomState.startingLife,
          format: roomState.format,
          players: roomState.players,
          isHost: false
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room')
      setIsJoining(false)
    }
  }

  return (
    <div className="min-h-screen bg-mesa-dark flex flex-col items-center justify-center p-4">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-mesa-gold mb-2">Magic Mesa</h1>
        <p className="text-mesa-text-secondary">4K Webcam Gaming for Magic: The Gathering</p>
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="bg-mesa-surface rounded-lg p-6 border border-mesa-border">
          <label className="block text-mesa-text mb-2 text-sm">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="w-full bg-mesa-dark border border-mesa-border rounded px-4 py-2 text-mesa-text focus:outline-none focus:border-mesa-gold"
          />
        </div>

        {error && (
          <div className="bg-mesa-red/20 border border-mesa-red rounded-lg p-4 text-mesa-red text-sm">
            {error}
          </div>
        )}

        <div className="bg-mesa-surface rounded-lg p-6 border border-mesa-border">
          <h2 className="text-lg font-semibold text-mesa-text mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-mesa-gold" />
            Create New Game
          </h2>

          <div className="mb-4">
            <label className="block text-mesa-text mb-2 text-sm">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full bg-mesa-dark border border-mesa-border rounded px-4 py-2 text-mesa-text focus:outline-none focus:border-mesa-gold"
            >
              <option value="commander">Commander (40 life)</option>
              <option value="standard">Standard (20 life)</option>
              <option value="modern">Modern (20 life)</option>
            </select>
          </div>

          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full bg-mesa-gold text-white font-semibold py-3 rounded hover:bg-mesa-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isCreating ? 'Creating...' : 'Create Room'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-mesa-border" />
          <span className="text-mesa-text-secondary text-sm">or</span>
          <div className="flex-1 h-px bg-mesa-border" />
        </div>

        <div className="bg-mesa-surface rounded-lg p-6 border border-mesa-border">
          <h2 className="text-lg font-semibold text-mesa-text mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-mesa-gold" />
            Join Existing Game
          </h2>

          <div className="mb-4">
            <label className="block text-mesa-text mb-2 text-sm">Room Code</label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-character code"
              maxLength={6}
              className="w-full bg-mesa-dark border border-mesa-border rounded px-4 py-2 text-mesa-text text-center tracking-widest font-mono text-lg focus:outline-none focus:border-mesa-gold uppercase"
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="w-full bg-mesa-blue text-white font-semibold py-3 rounded hover:bg-mesa-blue/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isJoining ? 'Joining...' : 'Join Room'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <p className="mt-12 text-mesa-text-secondary text-sm">
        Supports 4K video with up to 4 players
      </p>
    </div>
  )
}
