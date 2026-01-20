// Runtime configuration manager for Magic Mesa admin portal

export interface AppConfig {
  room: {
    timeoutMs: number
    maxPlayers: number
    allowPublicRooms: boolean
  }
  cardRecognition: {
    model: string
    maxTokens: number
    prompt: string
    enabled: boolean
  }
  features: {
    webrtcEnabled: boolean
    cardRecognitionEnabled: boolean
    commanderDamageTracking: boolean
  }
}

const DEFAULT_CONFIG: AppConfig = {
  room: {
    timeoutMs: 60000, // 1 minute
    maxPlayers: 4,
    allowPublicRooms: true
  },
  cardRecognition: {
    model: 'claude-opus-4-20250514',
    maxTokens: 200,
    prompt: 'Identify the Magic: The Gathering card at the CENTER of this image. There may be other cards visible at the edges - ignore them. Focus only on the card in the middle. Read the card name and respond with ONLY that card name. If unreadable, say UNKNOWN.',
    enabled: true
  },
  features: {
    webrtcEnabled: true,
    cardRecognitionEnabled: true,
    commanderDamageTracking: true
  }
}

class ConfigManager {
  private config: AppConfig

  constructor() {
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  }

  get(): AppConfig {
    return JSON.parse(JSON.stringify(this.config))
  }

  update(updates: Partial<AppConfig>): AppConfig {
    // Deep merge updates
    if (updates.room) {
      this.config.room = { ...this.config.room, ...updates.room }
    }
    if (updates.cardRecognition) {
      this.config.cardRecognition = { ...this.config.cardRecognition, ...updates.cardRecognition }
    }
    if (updates.features) {
      this.config.features = { ...this.config.features, ...updates.features }
    }

    return this.get()
  }

  reset(): AppConfig {
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
    return this.get()
  }

  // Convenience getters
  getRoomTimeout(): number {
    return this.config.room.timeoutMs
  }

  getMaxPlayers(): number {
    return this.config.room.maxPlayers
  }

  getCardRecognitionModel(): string {
    return this.config.cardRecognition.model
  }

  getCardRecognitionPrompt(): string {
    return this.config.cardRecognition.prompt
  }

  getCardRecognitionMaxTokens(): number {
    return this.config.cardRecognition.maxTokens
  }

  isFeatureEnabled(feature: keyof AppConfig['features']): boolean {
    return this.config.features[feature]
  }
}

export const config = new ConfigManager()
