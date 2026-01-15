import express from 'express'
import { createServer } from 'https'
import { createServer as createHttpServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'

const app = express()
app.use(cors())
app.use(express.json())

// Generate self-signed cert if needed
const certDir = join(process.cwd(), '.cert')
const keyPath = join(certDir, 'key.pem')
const certPath = join(certDir, 'cert.pem')

if (!existsSync(certDir)) {
  mkdirSync(certDir, { recursive: true })
}

if (!existsSync(keyPath) || !existsSync(certPath)) {
  console.log('Generating self-signed certificate...')
  try {
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`, { stdio: 'pipe' })
  } catch {
    console.log('OpenSSL not available, falling back to HTTP')
  }
}

const useHttps = existsSync(keyPath) && existsSync(certPath)
const server = useHttps
  ? createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, app)
  : createHttpServer(app)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

interface Player {
  id: string
  name: string
  seat: number
  life: number
  poison: number
  commanderDamage: Record<string, number>
}

interface Room {
  code: string
  hostId: string
  players: Map<string, Player>
  format: 'commander' | 'standard' | 'modern'
  startingLife: number
  createdAt: Date
}

const rooms = new Map<string, Room>()

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function getAvailableSeat(room: Room): number {
  const takenSeats = new Set([...room.players.values()].map(p => p.seat))
  for (let i = 0; i < 4; i++) {
    if (!takenSeats.has(i)) return i
  }
  return -1
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  let currentRoom: string | null = null
  let playerName: string | null = null

  socket.on('create-room', (data: { name: string; format: string }, callback) => {
    const code = generateRoomCode()
    const startingLife = data.format === 'commander' ? 40 : 20

    const room: Room = {
      code,
      hostId: socket.id,
      players: new Map(),
      format: data.format as Room['format'],
      startingLife,
      createdAt: new Date()
    }

    const player: Player = {
      id: socket.id,
      name: data.name,
      seat: 0,
      life: startingLife,
      poison: 0,
      commanderDamage: {}
    }

    room.players.set(socket.id, player)
    rooms.set(code, room)

    socket.join(code)
    currentRoom = code
    playerName = data.name

    callback({ success: true, code, seat: 0, startingLife })
    console.log(`Room ${code} created by ${data.name}`)
  })

  socket.on('join-room', (data: { code: string; name: string }, callback) => {
    const room = rooms.get(data.code.toUpperCase())

    if (!room) {
      callback({ success: false, error: 'Room not found' })
      return
    }

    if (room.players.size >= 4) {
      callback({ success: false, error: 'Room is full' })
      return
    }

    const seat = getAvailableSeat(room)
    if (seat === -1) {
      callback({ success: false, error: 'No available seats' })
      return
    }

    const player: Player = {
      id: socket.id,
      name: data.name,
      seat,
      life: room.startingLife,
      poison: 0,
      commanderDamage: {}
    }

    room.players.set(socket.id, player)
    socket.join(data.code.toUpperCase())
    currentRoom = data.code.toUpperCase()
    playerName = data.name

    // Notify existing players
    console.log(`[Room] Emitting player-joined to room ${currentRoom} for ${data.name}`)
    socket.to(currentRoom).emit('player-joined', {
      id: socket.id,
      name: data.name,
      seat,
      life: room.startingLife,
      poison: 0
    })

    // Send current room state to new player
    const players = [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      life: p.life,
      poison: p.poison
    }))

    callback({
      success: true,
      seat,
      startingLife: room.startingLife,
      players,
      format: room.format
    })

    console.log(`${data.name} joined room ${data.code}`)
  })

  // WebRTC Signaling (unified signal event for simple-peer)
  socket.on('signal', (data: { to: string; signal: unknown }) => {
    console.log(`[WebRTC] Relaying signal from ${socket.id} to ${data.to}`)
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal
    })
  })

  // Legacy WebRTC signaling (keep for compatibility)
  socket.on('offer', (data: { to: string; offer: RTCSessionDescriptionInit }) => {
    console.log(`[WebRTC] Relaying offer from ${socket.id} to ${data.to}`)
    io.to(data.to).emit('offer', {
      from: socket.id,
      offer: data.offer
    })
  })

  socket.on('answer', (data: { to: string; answer: RTCSessionDescriptionInit }) => {
    console.log(`[WebRTC] Relaying answer from ${socket.id} to ${data.to}`)
    io.to(data.to).emit('answer', {
      from: socket.id,
      answer: data.answer
    })
  })

  socket.on('ice-candidate', (data: { to: string; candidate: RTCIceCandidateInit }) => {
    console.log(`[WebRTC] Relaying ICE candidate from ${socket.id} to ${data.to}`, data.candidate?.candidate?.slice(0, 50))
    io.to(data.to).emit('ice-candidate', {
      from: socket.id,
      candidate: data.candidate
    })
  })

  // Game state updates
  socket.on('update-life', (data: { life: number }) => {
    if (!currentRoom) return
    const room = rooms.get(currentRoom)
    if (!room) return

    const player = room.players.get(socket.id)
    if (player) {
      player.life = data.life
      socket.to(currentRoom).emit('life-updated', {
        playerId: socket.id,
        life: data.life
      })
    }
  })

  socket.on('update-poison', (data: { poison: number }) => {
    if (!currentRoom) return
    const room = rooms.get(currentRoom)
    if (!room) return

    const player = room.players.get(socket.id)
    if (player) {
      player.poison = data.poison
      socket.to(currentRoom).emit('poison-updated', {
        playerId: socket.id,
        poison: data.poison
      })
    }
  })

  socket.on('update-commander-damage', (data: { from: string; damage: number }) => {
    if (!currentRoom) return
    const room = rooms.get(currentRoom)
    if (!room) return

    const player = room.players.get(socket.id)
    if (player) {
      player.commanderDamage[data.from] = data.damage
      socket.to(currentRoom).emit('commander-damage-updated', {
        playerId: socket.id,
        from: data.from,
        damage: data.damage
      })
    }
  })

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)

    if (currentRoom) {
      const room = rooms.get(currentRoom)
      if (room) {
        room.players.delete(socket.id)
        socket.to(currentRoom).emit('player-left', { id: socket.id })

        if (room.players.size === 0) {
          rooms.delete(currentRoom)
          console.log(`Room ${currentRoom} deleted (empty)`)
        } else if (room.hostId === socket.id) {
          // Transfer host to next player
          const newHost = room.players.keys().next().value
          if (newHost) {
            room.hostId = newHost
            io.to(currentRoom).emit('host-changed', { newHostId: newHost })
          }
        }
      }
    }
  })
})

const PORT = process.env.PORT || 3001
const HOST = '0.0.0.0'

server.listen(Number(PORT), HOST, () => {
  const protocol = useHttps ? 'https' : 'http'
  console.log(`Magic Mesa signaling server running on ${protocol}://${HOST}:${PORT}`)
})
