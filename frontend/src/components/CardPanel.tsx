import { useState } from 'react'
import { Search, X, ExternalLink } from 'lucide-react'

interface Card {
  id: string
  name: string
  image_uris?: {
    normal: string
    large: string
    art_crop: string
  }
  card_faces?: Array<{
    name: string
    image_uris?: {
      normal: string
      large: string
    }
  }>
  scryfall_uri: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
}

interface CardPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function CardPanel({ isOpen, onClose }: CardPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Card[]>([])
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')

  const searchCards = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setError('')

    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(searchQuery)}&order=name`
      )

      if (!response.ok) {
        if (response.status === 404) {
          setSearchResults([])
          setError('No cards found')
          return
        }
        throw new Error('Search failed')
      }

      const data = await response.json()
      setSearchResults(data.data.slice(0, 20))
    } catch (err) {
      setError('Failed to search cards')
      console.error(err)
    } finally {
      setIsSearching(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchCards()
    }
  }

  const getCardImage = (card: Card): string => {
    if (card.image_uris?.large) {
      return card.image_uris.large
    }
    if (card.card_faces?.[0]?.image_uris?.large) {
      return card.card_faces[0].image_uris.large
    }
    return ''
  }

  if (!isOpen) return null

  return (
    <div className="w-80 bg-mesa-surface border-l border-mesa-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-mesa-border flex items-center justify-between">
        <h2 className="text-mesa-text font-semibold">Card Lookup</h2>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-mesa-card text-mesa-text-secondary"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-mesa-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search cards..."
            className="flex-1 bg-mesa-dark border border-mesa-border rounded px-3 py-2 text-mesa-text text-sm focus:outline-none focus:border-mesa-gold"
          />
          <button
            onClick={searchCards}
            disabled={isSearching}
            className="px-3 py-2 bg-mesa-gold rounded hover:bg-mesa-gold/90 disabled:opacity-50"
          >
            <Search className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedCard ? (
          <div className="space-y-4">
            <button
              onClick={() => setSelectedCard(null)}
              className="text-mesa-gold text-sm hover:underline"
            >
              &larr; Back to results
            </button>

            <img
              src={getCardImage(selectedCard)}
              alt={selectedCard.name}
              className="w-full rounded-lg shadow-lg"
            />

            <div>
              <h3 className="text-mesa-text font-bold text-lg">{selectedCard.name}</h3>
              {selectedCard.mana_cost && (
                <p className="text-mesa-text-secondary text-sm">{selectedCard.mana_cost}</p>
              )}
              {selectedCard.type_line && (
                <p className="text-mesa-text text-sm mt-1">{selectedCard.type_line}</p>
              )}
              {selectedCard.oracle_text && (
                <p className="text-mesa-text-secondary text-sm mt-2 whitespace-pre-line">
                  {selectedCard.oracle_text}
                </p>
              )}
            </div>

            <a
              href={selectedCard.scryfall_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-mesa-gold text-sm hover:underline"
            >
              View on Scryfall <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <>
            {error && (
              <p className="text-mesa-text-secondary text-sm text-center py-4">{error}</p>
            )}

            {isSearching && (
              <p className="text-mesa-text-secondary text-sm text-center py-4">Searching...</p>
            )}

            {searchResults.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {searchResults.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => setSelectedCard(card)}
                    className="text-left hover:opacity-80 transition-opacity"
                  >
                    <img
                      src={getCardImage(card)}
                      alt={card.name}
                      className="w-full rounded shadow"
                    />
                  </button>
                ))}
              </div>
            )}

            {!isSearching && !error && searchResults.length === 0 && (
              <p className="text-mesa-text-secondary text-sm text-center py-8">
                Search for a card to see it here
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
