import { io, Socket } from 'socket.io-client'

const protocol = window.location.protocol === 'https:' ? 'https' : 'http'
const SIGNALING_SERVER = `${protocol}://${window.location.hostname}:3001`

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
}

class SignalingClient {
  private socket: Socket | null = null
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map()
  public localStream: MediaStream | null = null

  connect(): Promise<void> {
    return new Promise((resolve) => {
      this.socket = io(SIGNALING_SERVER)
      this.socket.on('connect', () => {
        console.log('Connected to signaling server')
        resolve()
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
        'host-changed'
      ]

      events.forEach(event => {
        this.socket?.on(event, (...args) => {
          console.log(`[Signaling] Received event: ${event}`)
          this.emit(event, ...args)
        })
      })
    })
  }

  disconnect(): void {
    this.socket?.disconnect()
    this.socket = null
  }

  get id(): string | undefined {
    return this.socket?.id
  }

  get connected(): boolean {
    return this.socket?.connected ?? false
  }

  createRoom(name: string, format: string): Promise<{ code: string; seat: number; startingLife: number }> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('create-room', { name, format }, (response: {
        success: boolean
        code?: string
        seat?: number
        startingLife?: number
        error?: string
      }) => {
        if (response.success) {
          resolve({
            code: response.code!,
            seat: response.seat!,
            startingLife: response.startingLife!
          })
        } else {
          reject(new Error(response.error))
        }
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
