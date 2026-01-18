import { io, Socket } from 'socket.io-client'

// Connect to same origin - Vite proxy routes /socket.io to backend
const SIGNALING_SERVER = window.location.origin

export interface PlayerInfo {
  id: string
  name: string
  seat: number
  life: number
  poison: number
}

export interface RoomState {
  code: string
  seat: number
  startingLife: number
  players: PlayerInfo[]
  format: string
  roomName?: string
}

export interface PublicRoom {
  code: string
  name: string
  format: string
  playerCount: number
  maxPlayers: number
  hostName: string
}

class SignalingClient {
  private socket: Socket | null = null
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map()
  private connectPromise: Promise<void> | null = null
  public localStream: MediaStream | null = null

  connect(): Promise<void> {
    // If already connected, return immediately
    if (this.socket?.connected) {
      return Promise.resolve()
    }

    // If connection is in progress, return existing promise
    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = new Promise((resolve, reject) => {
      console.log('Connecting to signaling server:', SIGNALING_SERVER)
      this.socket = io(SIGNALING_SERVER)

      const timeout = setTimeout(() => {
        this.connectPromise = null
        reject(new Error('Connection timeout'))
      }, 10000)

      this.socket.on('connect', () => {
        clearTimeout(timeout)
        console.log('Connected to signaling server')
        resolve()
      })

      this.socket.on('connect_error', (err) => {
        clearTimeout(timeout)
        this.connectPromise = null
        console.error('Connection error:', err)
        reject(err)
      })

      // Set up event forwarding
      const events = [
        'player-joined',
        'player-left',
        'offer',
        'answer',
        'ice-candidate',
        'signal',
        'life-updated',
        'poison-updated',
        'commander-damage-updated',
        'host-changed',
        'rooms-updated'
      ]

      events.forEach(event => {
        this.socket?.on(event, (...args) => {
          console.log(`[Signaling] Received event: ${event}`)
          this.emit(event, ...args)
        })
      })
    })

    return this.connectPromise
  }

  disconnect(): void {
    this.socket?.disconnect()
    this.socket = null
    this.connectPromise = null
  }

  get id(): string | undefined {
    return this.socket?.id
  }

  get connected(): boolean {
    return this.socket?.connected ?? false
  }

  createRoom(name: string, format: string, roomName?: string, isPublic: boolean = true): Promise<{ code: string; seat: number; startingLife: number; roomName: string }> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('create-room', { name, format, roomName, isPublic }, (response: {
        success: boolean
        code?: string
        seat?: number
        startingLife?: number
        roomName?: string
        error?: string
      }) => {
        if (response.success) {
          resolve({
            code: response.code!,
            seat: response.seat!,
            startingLife: response.startingLife!,
            roomName: response.roomName!
          })
        } else {
          reject(new Error(response.error))
        }
      })
    })
  }

  listRooms(): Promise<PublicRoom[]> {
    return new Promise((resolve) => {
      this.socket?.emit('list-rooms', (rooms: PublicRoom[]) => {
        resolve(rooms)
      })
    })
  }

  joinRoom(code: string, name: string): Promise<RoomState> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('join-room', { code, name }, (response: {
        success: boolean
        seat?: number
        startingLife?: number
        players?: PlayerInfo[]
        format?: string
        error?: string
      }) => {
        if (response.success) {
          resolve({
            code: code.toUpperCase(),
            seat: response.seat!,
            startingLife: response.startingLife!,
            players: response.players!,
            format: response.format!
          })
        } else {
          reject(new Error(response.error))
        }
      })
    })
  }

  sendSignal(to: string, signal: unknown): void {
    this.socket?.emit('signal', { to, signal })
  }

  sendOffer(to: string, offer: RTCSessionDescriptionInit): void {
    this.socket?.emit('offer', { to, offer })
  }

  sendAnswer(to: string, answer: RTCSessionDescriptionInit): void {
    this.socket?.emit('answer', { to, answer })
  }

  sendIceCandidate(to: string, candidate: RTCIceCandidateInit): void {
    console.log(`[Signaling] Sending ICE candidate to ${to}`, candidate.candidate?.slice(0, 50))
    this.socket?.emit('ice-candidate', { to, candidate })
  }

  updateLife(life: number): void {
    this.socket?.emit('update-life', { life })
  }

  updatePoison(poison: number): void {
    this.socket?.emit('update-poison', { poison })
  }

  updateCommanderDamage(from: string, damage: number): void {
    this.socket?.emit('update-commander-damage', { from, damage })
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  off(event: string, callback: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(callback)
  }

  private emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach(callback => callback(...args))
  }
}

export const signaling = new SignalingClient()
