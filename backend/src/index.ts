import 'dotenv/config'
import express from 'express'
import { createServer } from 'https'
import { createServer as createHttpServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { metrics } from './metrics'
import { logger, type LogCategory } from './logger'
import { config } from './config'

const app = express()
app.use(cors({
  origin: [
    'https://magicmesa.thefallen8.com',
    'https://admin.thefallen8.com',
    'http://localhost:5173',
    'http://localhost:5174'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}))
app.use(express.json({ limit: '10mb' }))

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

// Initialize Anthropic client
const anthropic = new Anthropic()

// ============================================
// Admin REST API Endpoints
// ============================================

app.get('/api/admin/metrics', (_req, res) => {
  logger.info('Admin', 'Metrics requested')
  const snapshot = metrics.getSnapshot(rooms.size)
  res.json(snapshot)
})

app.get('/api/admin/logs', (req, res) => {
  const category = req.query.category as LogCategory | undefined
  const limit = parseInt(req.query.limit as string) || 100
  const offset = parseInt(req.query.offset as string) || 0

  logger.debug('Admin', 'Logs requested', { category, limit, offset })
  const logs = logger.getLogs({ category, limit, offset })
  res.json({ logs, total: logs.length })
})

app.get('/api/admin/config', (_req, res) => {
  logger.info('Admin', 'Config requested')
  res.json(config.get())
})

app.put('/api/admin/config', (req, res) => {
  const updates = req.body
  logger.info('Admin', 'Config updated', updates)
  const newConfig = config.update(updates)
  res.json(newConfig)
})

// ============================================
// Card Recognition Endpoint
// ============================================

app.post('/api/recognize-card', async (req, res) => {
  const startTime = Date.now()

  // Check if card recognition is enabled
  if (!config.isFeatureEnabled('cardRecognitionEnabled')) {
    logger.warn('CardRecognition', 'Card recognition is disabled')
    return res.status(503).json({ error: 'Card recognition is currently disabled' })
  }

  try {
    const { image } = req.body

    if (!image) {
      logger.warn('CardRecognition', 'No image provided')
      return res.status(400).json({ error: 'No image provided' })
    }

    // Extract base64 data and media type from data URL
    const matches = image.match(/^data:(.+);base64,(.+)$/)
    if (!matches) {
      logger.warn('CardRecognition', 'Invalid image format')
      return res.status(400).json({ error: 'Invalid image format' })
    }

    const mediaType = matches[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    const base64Data = matches[2]

    // Log image size
    const imageSizeKB = Math.round(base64Data.length * 0.75 / 1024)
    logger.info('CardRecognition', `Received image: ${mediaType}, ~${imageSizeKB} KB`)

    const response = await anthropic.messages.create({
      model: config.getCardRecognitionModel(),
      max_tokens: config.getCardRecognitionMaxTokens(),
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
              text: config.getCardRecognitionPrompt()
            }
          ]
        }
      ]
    })

    const rawResponse = response.content[0].type === 'text'
      ? response.content[0].text.trim()
      : 'UNKNOWN'

    logger.debug('CardRecognition', `Raw Claude response: "${rawResponse}"`)

    let cardName = rawResponse

    // Try to extract card name from verbose responses
    const boldMatch = rawResponse.match(/\*\*([^*]+)\*\*/)
    if (boldMatch) {
      cardName = boldMatch[1].trim()
      logger.debug('CardRecognition', `Extracted from bold: "${cardName}"`)
    } else {
      cardName = rawResponse.replace(/^["'\-\s]+|["'\.\s]+$/g, '')

      if (
        cardName.length > 60 ||
        cardName.includes('\n') ||
        cardName.toLowerCase().includes('cannot read') ||
        cardName.toLowerCase().includes('cannot make out') ||
        cardName.toLowerCase().includes('not legible') ||
        cardName.toLowerCase().includes('unreadable')
      ) {
        logger.info('CardRecognition', `Got verbose/uncertain response, treating as unknown: ${cardName.slice(0, 100)}...`)
        cardName = 'UNKNOWN'
      }
    }

    const duration = Date.now() - startTime
    const success = cardName !== 'UNKNOWN'

    // Record metrics
    metrics.recordCardRecognition({
      success,
      cardName: success ? cardName : null,
      duration,
      imageSizeKB,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens
    })

    // Emit to admin namespace
    adminIO?.emit('card-recognition', {
      timestamp: new Date(),
      success,
      cardName: success ? cardName : null,
      duration,
      imageSizeKB,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens
    })

    logger.info('CardRecognition', `Identified: ${cardName}`, { duration, success })
    res.json({ cardName: cardName === 'UNKNOWN' ? null : cardName })
  } catch (err) {
    const duration = Date.now() - startTime
    logger.error('CardRecognition', 'Recognition failed', { error: String(err), duration })

    // Record failed metric
    metrics.recordCardRecognition({
      success: false,
      cardName: null,
      duration,
      imageSizeKB: 0
    })

    res.status(500).json({ error: 'Failed to recognize card' })
  }
})

// ============================================
// Server Setup
// ============================================

const server = useHttps
  ? createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, app)
  : createHttpServer(app)

const io = new Server(server, {
  cors: {
    origin: [
      'https://magicmesa.thefallen8.com',
      'https://admin.thefallen8.com',
      'http://localhost:5173',
      'http://localhost:5174'
    ],
    methods: ['GET', 'POST']
  }
})

// Admin Socket.IO namespace
const adminIO = io.of('/admin')

// Emit metrics update every 5 seconds
setInterval(() => {
  const snapshot = metrics.getSnapshot(rooms.size)
  adminIO.emit('metrics-update', snapshot)
}, 5000)

// Admin namespace connection handling
adminIO.on('connection', (socket) => {
  logger.info('Admin', `Admin client connected: ${socket.id}`)

  // Send initial metrics snapshot
  socket.emit('metrics-update', metrics.getSnapshot(rooms.size))

  // Subscribe to log stream
  const unsubscribe = logger.subscribe((entry) => {
    socket.emit('log-entry', entry)
  })

  socket.on('disconnect', () => {
    logger.info('Admin', `Admin client disconnected: ${socket.id}`)
    unsubscribe()
  })
})

// ============================================
// Room & Player Types
// ============================================

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
    if (room.players.size > 0 && room.players.size < config.getMaxPlayers()) {
      const host = room.players.get(room.hostId)
      listedRooms.push({
        code: room.isPublic ? room.code : '',
        name: room.name,
        format: room.format,
        playerCount: room.players.size,
        maxPlayers: config.getMaxPlayers(),
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
  for (let i = 0; i < config.getMaxPlayers(); i++) {
    if (!takenSeats.has(i)) return i
  }
  return -1
}

// ============================================
// Main Socket.IO Handlers
// ============================================

io.on('connection', (socket) => {
  logger.info('Socket', `Client connected: ${socket.id}`)
  metrics.recordSocketConnect()

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
    metrics.updateRoomCount(rooms.size)

    socket.join(code)
    currentRoom = code
    playerName = data.name

    // Broadcast updated room list to all clients
    io.emit('rooms-updated', getListedRooms())

    logger.info('Room', `Room ${code} "${room.name}" created by ${data.name}`)
    callback({ success: true, code, seat: 0, startingLife, roomName: room.name })
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
      logger.info('Room', `Room ${roomCode} deletion cancelled - player rejoining`)
    }

    if (room.players.size >= config.getMaxPlayers()) {
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

    logger.info('Room', `${data.name} joined room ${roomCode}`)
    callback({
      success: true,
      seat,
      startingLife: room.startingLife,
      players,
      format: room.format
    })

    // Broadcast updated room list
    io.emit('rooms-updated', getListedRooms())
  })

  // WebRTC Signaling
  socket.on('signal', (data: { to: string; signal: unknown }) => {
    logger.debug('Socket', `Relaying signal from ${socket.id} to ${data.to}`)
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal
    })
  })

  socket.on('offer', (data: { to: string; offer: RTCSessionDescriptionInit }) => {
    logger.debug('Socket', `Relaying offer from ${socket.id} to ${data.to}`)
    io.to(data.to).emit('offer', {
      from: socket.id,
      offer: data.offer
    })
  })

  socket.on('answer', (data: { to: string; answer: RTCSessionDescriptionInit }) => {
    logger.debug('Socket', `Relaying answer from ${socket.id} to ${data.to}`)
    io.to(data.to).emit('answer', {
      from: socket.id,
      answer: data.answer
    })
  })

  socket.on('ice-candidate', (data: { to: string; candidate: RTCIceCandidateInit }) => {
    logger.debug('Socket', `Relaying ICE candidate from ${socket.id} to ${data.to}`)
    io.to(data.to).emit('ice-candidate', {
      from: socket.id,
      candidate: data.candidate
    })
  })

  // Remote card scan request
  socket.on('request-card-scan', (data: { targetId: string; clickPos: { x: number; y: number } }) => {
    logger.debug('CardRecognition', `${socket.id} requesting scan from ${data.targetId}`)
    io.to(data.targetId).emit('scan-card-request', {
      requesterId: socket.id,
      clickPos: data.clickPos
    })
  })

  // Card scan result
  socket.on('card-scan-result', (data: { requesterId: string; cardName: string | null }) => {
    logger.debug('CardRecognition', `Sending result to ${data.requesterId}: ${data.cardName}`)
    io.to(data.requesterId).emit('scan-card-response', {
      cardName: data.cardName
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
    logger.info('Socket', `Client disconnected: ${socket.id}`)
    metrics.recordSocketDisconnect()

    if (currentRoom) {
      const room = rooms.get(currentRoom)
      if (room) {
        room.players.delete(socket.id)
        socket.to(currentRoom).emit('player-left', { id: socket.id })

        if (room.players.size === 0) {
          const roomCode = currentRoom
          logger.info('Room', `Room ${roomCode} is empty, will delete in ${config.getRoomTimeout() / 1000} seconds`)
          const timer = setTimeout(() => {
            if (rooms.has(roomCode) && rooms.get(roomCode)!.players.size === 0) {
              rooms.delete(roomCode)
              roomDeletionTimers.delete(roomCode)
              metrics.updateRoomCount(rooms.size)
              logger.info('Room', `Room ${roomCode} deleted (timeout)`)
            }
          }, config.getRoomTimeout())
          roomDeletionTimers.set(roomCode, timer)
        } else if (room.hostId === socket.id) {
          const newHost = room.players.keys().next().value
          if (newHost) {
            room.hostId = newHost
            io.to(currentRoom).emit('host-changed', { newHostId: newHost })
            logger.info('Room', `Host transferred in room ${currentRoom} to ${newHost}`)
          }
        }

        metrics.updateRoomCount(rooms.size)
        io.emit('rooms-updated', getListedRooms())
      }
    }
  })
})

// ============================================
// Server Start
// ============================================

const PORT = process.env.PORT || 3002
const HOST = '0.0.0.0'

logger.info('System', 'Magic Mesa server starting...')

server.listen(Number(PORT), HOST, () => {
  const protocol = useHttps ? 'https' : 'http'
  logger.info('System', `Magic Mesa signaling server running on ${protocol}://${HOST}:${PORT}`)
  console.log(`Magic Mesa signaling server running on ${protocol}://${HOST}:${PORT}`)
})
