import 'dotenv/config'
import express from 'express'
import { createServer } from 'https'
import { createServer as createHttpServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' })) // Increase limit for image data

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

const useHttps = false // Force HTTP for local dev

// Initialize Anthropic client (uses ANTHROPIC_API_KEY env var)
const anthropic = new Anthropic()

// Card recognition endpoint using Claude Vision
app.post('/api/recognize-card', async (req, res) => {
  try {
    const { image } = req.body

    if (!image) {
      return res.status(400).json({ error: 'No image provided' })
    }

    // Extract base64 data and media type from data URL
    const matches = image.match(/^data:(.+);base64,(.+)$/)
    if (!matches) {
      return res.status(400).json({ error: 'Invalid image format' })
    }

    const mediaType = matches[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    const base64Data = matches[2]

    // Log image size for debugging
    const imageSizeKB = Math.round(base64Data.length * 0.75 / 1024) // base64 is ~33% larger than binary
    console.log(`[CardRecognition] Received image: ${mediaType}, ~${imageSizeKB} KB`)

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data
              }
            },
            {
              type: 'text',
              text: `Identify the Magic: The Gathering card at the CENTER of this image. There may be other cards visible at the edges - ignore them. Focus only on the card in the middle. Read the card name and respond with ONLY that card name. If unreadable, say UNKNOWN.`
            }
          ]
        }
      ]
    })

    const rawResponse = response.content[0].type === 'text'
      ? response.content[0].text.trim()
      : 'UNKNOWN'

    console.log(`[CardRecognition] Raw Claude response: "${rawResponse}"`)

    let cardName = rawResponse

    // Try to extract card name from verbose responses
    // Look for patterns like "this is **Card Name**" or "appears to be **Card Name**"
    const boldMatch = rawResponse.match(/\*\*([^*]+)\*\*/)
    if (boldMatch) {
      cardName = boldMatch[1].trim()
      console.log(`[CardRecognition] Extracted from bold: "${cardName}"`)
    } else {
      // Clean up common issues with the response
      cardName = rawResponse.replace(/^["'\-\s]+|["'\.\s]+$/g, '')

      // If response is too long or indicates complete failure, treat as unknown
      if (
        cardName.length > 60 ||
        cardName.includes('\n') ||
        cardName.toLowerCase().includes('cannot read') ||
        cardName.toLowerCase().includes('cannot make out') ||
        cardName.toLowerCase().includes('not legible') ||
        cardName.toLowerCase().includes('unreadable')
      ) {
        console.log(`[CardRecognition] Got verbose/uncertain response, treating as unknown: ${cardName.slice(0, 100)}...`)
        cardName = 'UNKNOWN'
      }
    }

    console.log(`[CardRecognition] Identified: ${cardName}`)
    res.json({ cardName: cardName === 'UNKNOWN' ? null : cardName })
  } catch (err) {
    console.error('[CardRecognition] Error:', err)
    res.status(500).json({ error: 'Failed to recognize card' })
  }
})

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
  name: string
  hostId: string
  players: Map<string, Player>
  format: 'commander' | 'standard' | 'modern'
  startingLife: number
  createdAt: Date
  isPublic: boolean
}

const rooms = new Map<string, Room>()
const roomDeletionTimers = new Map<string, NodeJS.Timeout>()

const ROOM_TIMEOUT_MS = 60000 // 1 minute

function getListedRooms() {
  const listedRooms: Array<{
    code: string
    name: string
    format: string
    playerCount: number
    maxPlayers: number
    hostName: string
    isPublic: boolean
  }> = []

  rooms.forEach((room) => {
    if (room.players.size > 0 && room.players.size < 4) {
      const host = room.players.get(room.hostId)
      listedRooms.push({
        code: room.isPublic ? room.code : '', // Hide code for private rooms
        name: room.name,
        format: room.format,
        playerCount: room.players.size,
        maxPlayers: 4,
        hostName: host?.name || 'Unknown',
        isPublic: room.isPublic
      })
    }
  })

  return listedRooms
}

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

  // Send current room list on connect
  socket.emit('rooms-updated', getListedRooms())

  socket.on('list-rooms', (callback) => {
    callback(getListedRooms())
  })

  socket.on('create-room', (data: { name: string; format: string; roomName?: string; isPublic?: boolean }, callback) => {
    const code = generateRoomCode()
    const startingLife = data.format === 'commander' ? 40 : 20

    const room: Room = {
      code,
      name: data.roomName || `${data.name}'s Game`,
      hostId: socket.id,
      players: new Map(),
      format: data.format as Room['format'],
      startingLife,
      createdAt: new Date(),
      isPublic: data.isPublic ?? true
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

    // Broadcast updated room list to all clients
    io.emit('rooms-updated', getListedRooms())

    callback({ success: true, code, seat: 0, startingLife, roomName: room.name })
    console.log(`Room ${code} "${room.name}" created by ${data.name}`)
  })

  socket.on('join-room', (data: { code: string; name: string }, callback) => {
    const roomCode = data.code.toUpperCase()
    const room = rooms.get(roomCode)

    if (!room) {
      callback({ success: false, error: 'Room not found' })
      return
    }

    // Cancel any pending room deletion
    const pendingTimer = roomDeletionTimers.get(roomCode)
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      roomDeletionTimers.delete(roomCode)
      console.log(`Room ${roomCode} deletion cancelled - player rejoining`)
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
    socket.join(roomCode)
    currentRoom = roomCode
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

    // Broadcast updated room list
    io.emit('rooms-updated', getListedRooms())

    console.log(`${data.name} joined room ${roomCode}`)
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
          // Start deletion timer instead of immediate deletion
          const roomCode = currentRoom
          console.log(`Room ${roomCode} is empty, will delete in 60 seconds`)
          const timer = setTimeout(() => {
            if (rooms.has(roomCode) && rooms.get(roomCode)!.players.size === 0) {
              rooms.delete(roomCode)
              roomDeletionTimers.delete(roomCode)
              console.log(`Room ${roomCode} deleted (timeout)`)
            }
          }, ROOM_TIMEOUT_MS)
          roomDeletionTimers.set(roomCode, timer)
        } else if (room.hostId === socket.id) {
          // Transfer host to next player
          const newHost = room.players.keys().next().value
          if (newHost) {
            room.hostId = newHost
            io.to(currentRoom).emit('host-changed', { newHostId: newHost })
          }
        }

        // Broadcast updated room list
        io.emit('rooms-updated', getListedRooms())
      }
    }
  })
})

const PORT = process.env.PORT || 3002
const HOST = '0.0.0.0'

server.listen(Number(PORT), HOST, () => {
  const protocol = useHttps ? 'https' : 'http'
  console.log(`Magic Mesa signaling server running on ${protocol}://${HOST}:${PORT}`)
})
