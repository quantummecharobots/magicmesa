import { Minus, Plus, Skull, Heart } from 'lucide-react'

interface LifeCounterProps {
  life: number
  poison: number
  startingLife: number
  onLifeChange: (life: number) => void
  onPoisonChange: (poison: number) => void
  commanderDamage?: Record<string, number>
  onCommanderDamageChange?: (from: string, damage: number) => void
  opponents?: Array<{ id: string; name: string }>
}

export function LifeCounter({
  life,
  poison,
  startingLife,
  onLifeChange,
  onPoisonChange,
  commanderDamage = {},
  onCommanderDamageChange,
  opponents = []
}: LifeCounterProps) {
  return (
    <div className="bg-mesa-surface rounded-lg p-4 border border-mesa-border">
      {/* Life Total */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-mesa-text-secondary text-sm flex items-center gap-1">
            <Heart className="w-4 h-4" /> Life Total
          </span>
          <button
            onClick={() => onLifeChange(startingLife)}
            className="text-xs text-mesa-text-secondary hover:text-mesa-text"
          >
            Reset
          </button>
        </div>

        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-col gap-1">
            <button
              onClick={() => onLifeChange(life - 5)}
              className="w-10 h-8 rounded bg-mesa-red/20 hover:bg-mesa-red/40 text-mesa-red font-bold"
            >
              -5
            </button>
            <button
              onClick={() => onLifeChange(life - 1)}
              className="w-10 h-10 rounded bg-mesa-red/20 hover:bg-mesa-red/40 text-mesa-red"
            >
              <Minus className="w-5 h-5 mx-auto" />
            </button>
          </div>

          <div className="text-center">
            <div className="text-5xl font-bold text-mesa-text tabular-nums">{life}</div>
          </div>

          <div className="flex flex-col gap-1">
            <button
              onClick={() => onLifeChange(life + 5)}
              className="w-10 h-8 rounded bg-mesa-green/20 hover:bg-mesa-green/40 text-mesa-green font-bold"
            >
              +5
            </button>
            <button
              onClick={() => onLifeChange(life + 1)}
              className="w-10 h-10 rounded bg-mesa-green/20 hover:bg-mesa-green/40 text-mesa-green"
            >
              <Plus className="w-5 h-5 mx-auto" />
            </button>
          </div>
        </div>
      </div>

      {/* Poison Counter */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-mesa-text-secondary text-sm flex items-center gap-1">
            <Skull className="w-4 h-4 text-green-400" /> Poison Counters
          </span>
          <button
            onClick={() => onPoisonChange(0)}
            className="text-xs text-mesa-text-secondary hover:text-mesa-text"
          >
            Reset
          </button>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => onPoisonChange(Math.max(0, poison - 1))}
            className="w-10 h-10 rounded bg-green-500/20 hover:bg-green-500/40 text-green-400"
          >
            <Minus className="w-5 h-5 mx-auto" />
          </button>

          <div className="text-center min-w-[60px]">
            <div className={`text-3xl font-bold tabular-nums ${poison >= 10 ? 'text-mesa-red' : 'text-green-400'}`}>
              {poison}
            </div>
          </div>

          <button
            onClick={() => onPoisonChange(poison + 1)}
            className="w-10 h-10 rounded bg-green-500/20 hover:bg-green-500/40 text-green-400"
          >
            <Plus className="w-5 h-5 mx-auto" />
          </button>
        </div>

        {poison >= 10 && (
          <p className="text-center text-mesa-red text-sm mt-2">Lethal poison!</p>
        )}
      </div>

      {/* Commander Damage */}
      {opponents.length > 0 && onCommanderDamageChange && (
        <div>
          <div className="text-mesa-text-secondary text-sm mb-2">Commander Damage</div>
          <div className="space-y-2">
            {opponents.map(opponent => {
              const damage = commanderDamage[opponent.id] || 0
              return (
                <div
                  key={opponent.id}
                  className="flex items-center justify-between bg-mesa-card rounded px-3 py-2"
                >
                  <span className="text-mesa-text text-sm">{opponent.name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onCommanderDamageChange(opponent.id, Math.max(0, damage - 1))}
                      className="w-6 h-6 rounded bg-mesa-border hover:bg-mesa-border/70 text-mesa-text text-sm"
                    >
                      -
                    </button>
                    <span className={`w-8 text-center font-bold ${damage >= 21 ? 'text-mesa-red' : 'text-mesa-text'}`}>
                      {damage}
                    </span>
                    <button
                      onClick={() => onCommanderDamageChange(opponent.id, damage + 1)}
                      className="w-6 h-6 rounded bg-mesa-border hover:bg-mesa-border/70 text-mesa-text text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
