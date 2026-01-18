import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signaling, PublicRoom } from '../lib/signaling'
import { Users, Play, ArrowRight, Globe } from 'lucide-react'

export function Home() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [format, setFormat] = useState('commander')
  const [roomName, setRoomName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([])
  const [joiningRoomCode, setJoiningRoomCode] = useState<string | null>(null)

  // Connect to signaling server to get room updates
  useEffect(() => {
    let mounted = true

    const connectAndListen = async () => {
      try {
        if (!signaling.connected) {
          await signaling.connect()
        }
        if (mounted) {
          const rooms = await signaling.listRooms()
          setPublicRooms(rooms)
        }
      } catch (err) {
        console.log('Could not fetch rooms:', err)
      }
    }

    connectAndListen()

    const handleRoomsUpdated = (rooms: unknown) => {
      if (mounted) {
        setPublicRooms(rooms as PublicRoom[])
      }
    }

    signaling.on('rooms-updated', handleRoomsUpdated)

    return () => {
      mounted = false
      signaling.off('rooms-updated', handleRoomsUpdated)
    }
  }, [])

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }

    setIsCreating(true)
    setError('')

    try {
      if (!signaling.connected) {
        await signaling.connect()
      }
      const { code, seat, startingLife, roomName: createdRoomName } = await signaling.createRoom(
        name.trim(),
        format,
        roomName.trim() || undefined,
        isPublic
      )
      navigate(`/room/${code}`, {
        state: { name: name.trim(), seat, startingLife, format, isHost: true, roomName: createdRoomName }
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
      if (!signaling.connected) {
        await signaling.connect()
      }
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

  const handleJoinRoom = async (code: string) => {
    if (!name.trim()) {
      setError('Please enter your name first')
      return
    }

    setJoiningRoomCode(code)
    setError('')

    try {
      if (!signaling.connected) {
        await signaling.connect()
      }
      const roomState = await signaling.joinRoom(code, name.trim())
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
      setJoiningRoomCode(null)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* Title with fantasy styling */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-mesa-gold font-fantasy text-glow mb-2">
          Magic Mesa
        </h1>
        <p className="text-mesa-text-secondary">4K Webcam Gaming for Magic: The Gathering</p>
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Name input panel */}
        <div className="panel-ornate p-6">
          <label className="block text-mesa-text mb-2 text-sm">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="input-ornate"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="panel p-4 border-mesa-red bg-mesa-red/10">
            <p className="text-mesa-red text-sm">{error}</p>
          </div>
        )}

        {/* Create game panel */}
        <div className="panel-ornate p-6">
          <h2 className="text-lg font-semibold text-mesa-text mb-4 flex items-center gap-2 panel-header">
            <Play className="w-5 h-5 text-mesa-gold" />
            Create New Game
          </h2>

          <div className="mb-4">
            <label className="block text-mesa-text mb-2 text-sm">Room Name (optional)</label>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder={`${name.trim() || 'Your'}'s Game`}
              className="input-ornate"
            />
          </div>

          <div className="mb-4">
            <label className="block text-mesa-text mb-2 text-sm">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="select-ornate"
            >
              <option value="commander">Commander (40 life)</option>
              <option value="standard">Standard (20 life)</option>
              <option value="modern">Modern (20 life)</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2 text-mesa-text text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 rounded border-mesa-border bg-mesa-dark text-mesa-gold focus:ring-mesa-gold accent-mesa-gold"
              />
              List room publicly (others can see and join)
            </label>
          </div>

          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full btn-gold flex items-center justify-center gap-2"
          >
            {isCreating ? 'Creating...' : 'Create Room'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Ornate divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 divider-ornate" />
          <span className="text-mesa-text-secondary text-sm font-fantasy">or</span>
          <div className="flex-1 divider-ornate" />
        </div>

        {/* Join game panel */}
        <div className="panel-ornate p-6">
          <h2 className="text-lg font-semibold text-mesa-text mb-4 flex items-center gap-2 panel-header">
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
              className="input-ornate text-center tracking-widest font-mono text-lg uppercase"
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="w-full btn-secondary flex items-center justify-center gap-2"
          >
            {isJoining ? 'Joining...' : 'Join Room'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Open Rooms List */}
        {publicRooms.length > 0 && (
          <>
            <div className="flex items-center gap-4">
              <div className="flex-1 divider-ornate" />
              <span className="text-mesa-text-secondary text-sm font-fantasy">open games</span>
              <div className="flex-1 divider-ornate" />
            </div>

            <div className="panel-ornate p-6">
              <h2 className="text-lg font-semibold text-mesa-text mb-4 flex items-center gap-2 panel-header">
                <Globe className="w-5 h-5 text-mesa-gold" />
                Open Rooms
              </h2>

              <div className="space-y-3">
                {publicRooms.map((room) => (
                  <div
                    key={room.code}
                    className="flex items-center justify-between panel p-4 hover-glow cursor-pointer"
                  >
                    <div>
                      <div className="text-mesa-text font-medium">{room.name}</div>
                      <div className="text-mesa-text-secondary text-sm">
                        {room.format.charAt(0).toUpperCase() + room.format.slice(1)} · {room.playerCount}/{room.maxPlayers} players · Host: {room.hostName}
                      </div>
                    </div>
                    <button
                      onClick={() => handleJoinRoom(room.code)}
                      disabled={joiningRoomCode === room.code}
                      className="btn-secondary !py-2 !px-4 text-sm"
                    >
                      {joiningRoomCode === room.code ? 'Joining...' : 'Join'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <p className="mt-12 text-mesa-text-secondary text-sm">
        Supports 4K video with up to 4 players
      </p>
    </div>
  )
}
