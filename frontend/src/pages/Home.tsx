import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signaling, PublicRoom } from '../lib/signaling'
import { Users, Play, ArrowRight, Globe, Lock } from 'lucide-react'

const SAVED_NAME_KEY = 'magicmesa_player_name'

export function Home() {
  const navigate = useNavigate()
  const [name, setName] = useState(() => {
    return localStorage.getItem(SAVED_NAME_KEY) || ''
  })
  const [format, setFormat] = useState('commander')
  const [roomName, setRoomName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([])
  const [joiningRoomCode, setJoiningRoomCode] = useState<string | null>(null)
  const [expandedPrivateRoom, setExpandedPrivateRoom] = useState<string | null>(null)
  const [privateRoomCode, setPrivateRoomCode] = useState('')

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

  const handleNameChange = (value: string) => {
    setName(value)
    if (value.trim()) {
      localStorage.setItem(SAVED_NAME_KEY, value.trim())
    }
  }

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

  const handlePrivateRoomClick = (roomName: string) => {
    if (expandedPrivateRoom === roomName) {
      setExpandedPrivateRoom(null)
      setPrivateRoomCode('')
    } else {
      setExpandedPrivateRoom(roomName)
      setPrivateRoomCode('')
    }
  }

  const handleJoinPrivateRoom = async () => {
    if (!name.trim()) {
      setError('Please enter your name first')
      return
    }
    if (!privateRoomCode.trim()) {
      setError('Please enter the room code')
      return
    }

    setIsJoining(true)
    setError('')

    try {
      if (!signaling.connected) {
        await signaling.connect()
      }
      const roomState = await signaling.joinRoom(privateRoomCode.trim(), name.trim())
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
            onChange={(e) => handleNameChange(e.target.value)}
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

        {/* Join Game panel */}
        <div className="panel-ornate p-6">
          <h2 className="text-lg font-semibold text-mesa-text mb-4 flex items-center gap-2 panel-header">
            <Users className="w-5 h-5 text-mesa-gold" />
            Join Game
          </h2>

          <div className="space-y-3">
            {/* Room list - both public and private */}
            {publicRooms.length === 0 ? (
              <div className="text-mesa-text-secondary text-sm text-center py-4">
                No games available. Create one below!
              </div>
            ) : (
              publicRooms.map((room, index) => (
                <div key={room.isPublic ? room.code : `private-${index}`} className="panel p-4 hover-glow">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => !room.isPublic && handlePrivateRoomClick(room.name)}
                  >
                    <div className="flex items-center gap-3">
                      {room.isPublic ? (
                        <Globe className="w-4 h-4 text-mesa-text-secondary" />
                      ) : (
                        <Lock className="w-4 h-4 text-mesa-text-secondary" />
                      )}
                      <div>
                        <div className="text-mesa-text font-medium">{room.name}</div>
                        <div className="text-mesa-text-secondary text-sm">
                          {room.format.charAt(0).toUpperCase() + room.format.slice(1)} · {room.playerCount}/{room.maxPlayers} players · Host: {room.hostName}
                        </div>
                      </div>
                    </div>
                    {room.isPublic ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleJoinRoom(room.code)
                        }}
                        disabled={joiningRoomCode === room.code}
                        className="btn-secondary !py-2 !px-4 text-sm"
                      >
                        {joiningRoomCode === room.code ? 'Joining...' : 'Join'}
                      </button>
                    ) : (
                      <ArrowRight className={`w-4 h-4 text-mesa-text-secondary transition-transform ${expandedPrivateRoom === room.name ? 'rotate-90' : ''}`} />
                    )}
                  </div>

                  {/* Code input for private rooms */}
                  {!room.isPublic && expandedPrivateRoom === room.name && (
                    <div className="mt-4 pt-4 border-t border-mesa-border">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={privateRoomCode}
                          onChange={(e) => setPrivateRoomCode(e.target.value.toUpperCase())}
                          placeholder="Enter room code"
                          maxLength={6}
                          className="input-ornate text-center tracking-widest font-mono text-lg uppercase flex-1"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleJoinPrivateRoom()
                          }}
                          disabled={isJoining || !privateRoomCode.trim()}
                          className="btn-secondary !px-4"
                        >
                          {isJoining ? '...' : 'Join'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ornate divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 divider-ornate" />
          <span className="text-mesa-text-secondary text-sm font-fantasy">or</span>
          <div className="flex-1 divider-ornate" />
        </div>

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
              Open to all Mages
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
      </div>

      <p className="mt-12 text-mesa-text-secondary text-sm">
        Supports 4K video with up to 4 players
      </p>
    </div>
  )
}
