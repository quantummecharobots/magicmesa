import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, X, ExternalLink, Trash2 } from 'lucide-react'

interface Card {
  id: string
  name: string
  image_uris?: {
    normal: string
    large: string
    art_crop: string
    small: string
  }
  card_faces?: Array<{
    name: string
    image_uris?: {
      normal: string
      large: string
      small: string
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
  initialSearch?: string
}

export function CardPanel({ isOpen, onClose, initialSearch }: CardPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Card[]>([])
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [cardStack, setCardStack] = useState<Card[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const debounceRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch autocomplete suggestions
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([])
      return
    }

    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`
      )
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.data.slice(0, 8))
      }
    } catch (err) {
      console.error('Autocomplete error:', err)
    }
  }, [])

  // Debounced input handler
  const handleInputChange = useCallback((value: string) => {
    setSearchQuery(value)
    setSelectedSuggestionIndex(-1)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = window.setTimeout(() => {
      fetchSuggestions(value)
      setShowSuggestions(true)
    }, 150)
  }, [fetchSuggestions])

  // Search for cards
  const searchCards = useCallback(async (query?: string, autoSelect?: boolean) => {
    const searchTerm = query || searchQuery
    if (!searchTerm.trim()) return

    setIsSearching(true)
    setError('')
    setShowSuggestions(false)
    setSuggestions([])

    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(searchTerm)}&order=name`
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
      const results = data.data.slice(0, 20)
      setSearchResults(results)

      // Auto-select first result if requested (for AI recognition)
      if (autoSelect && results.length > 0) {
        const card = results[0]
        setSelectedCard(card)
        // Add to stack if not already there
        setCardStack(prev => {
          if (prev.some(c => c.id === card.id)) return prev
          return [card, ...prev]
        })
      }
    } catch (err) {
      setError('Failed to search cards')
      console.error(err)
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery])

  // Handle selecting a suggestion
  const selectSuggestion = useCallback((suggestion: string) => {
    setSearchQuery(suggestion)
    setShowSuggestions(false)
    setSuggestions([])
    searchCards(suggestion)
  }, [searchCards])

  // Keyboard navigation for suggestions
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedSuggestionIndex >= 0) {
          selectSuggestion(suggestions[selectedSuggestionIndex])
        } else if (searchQuery.trim()) {
          searchCards()
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false)
      }
    } else if (e.key === 'Enter') {
      searchCards()
    }
  }

  // Auto-search when initialSearch prop changes (from AI recognition)
  useEffect(() => {
    if (initialSearch && isOpen) {
      setSearchQuery(initialSearch)
      setSelectedCard(null)
      setShowSuggestions(false)
      // Auto-search and select the first result
      searchCards(initialSearch, true)
    }
  }, [initialSearch, isOpen, searchCards])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const getCardImage = (card: Card, size: 'large' | 'normal' | 'small' = 'large'): string => {
    if (card.image_uris?.[size]) {
      return card.image_uris[size]
    }
    if (card.card_faces?.[0]?.image_uris?.[size]) {
      return card.card_faces[0].image_uris[size]
    }
    // Fallback to any available size
    if (card.image_uris?.normal) return card.image_uris.normal
    if (card.card_faces?.[0]?.image_uris?.normal) return card.card_faces[0].image_uris.normal
    return ''
  }

  const removeFromStack = (cardId: string) => {
    setCardStack(prev => prev.filter(c => c.id !== cardId))
  }

  const clearStack = () => {
    setCardStack([])
  }

  if (!isOpen) return null

  return (
    <div className="w-80 panel-ornate border-l-2 border-mesa-gold flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-mesa-border flex items-center justify-between">
        <h2 className="text-mesa-text font-semibold font-fantasy text-glow">Card Lookup</h2>
        <button
          onClick={onClose}
          className="btn-icon"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-mesa-border">
        <div className="flex gap-2">
          <div className="flex-1 relative" ref={inputRef}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Search cards..."
              className="input-ornate text-sm"
            />
            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 panel border-glow rounded shadow-lg z-20 max-h-64 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion}
                    onClick={() => selectSuggestion(suggestion)}
                    className={`w-full text-left px-3 py-2 text-sm text-mesa-text hover:bg-mesa-card transition-colors ${
                      index === selectedSuggestionIndex ? 'bg-mesa-card border-l-2 border-mesa-gold' : ''
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => searchCards()}
            disabled={isSearching}
            className="btn-gold !py-2 !px-3"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedCard ? (
          <div className="space-y-4">
            <button
              onClick={() => setSelectedCard(null)}
              className="text-mesa-gold text-sm hover:underline font-fantasy"
            >
              &larr; Back to results
            </button>

            <img
              src={getCardImage(selectedCard)}
              alt={selectedCard.name}
              className="w-full rounded-lg shadow-lg border border-mesa-gold/30"
            />

            <div>
              <h3 className="text-mesa-text font-bold text-lg font-fantasy">{selectedCard.name}</h3>
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

            <a
              href={`https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${encodeURIComponent(selectedCard.name)}&view=grid`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-green-400 text-sm hover:underline"
            >
              Buy on TCGPlayer <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <>
            {error && (
              <p className="text-mesa-text-secondary text-sm text-center py-4">{error}</p>
            )}

            {isSearching && (
              <p className="text-mesa-text-secondary text-sm text-center py-4 shimmer">Searching...</p>
            )}

            {searchResults.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {searchResults.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => setSelectedCard(card)}
                    className="text-left hover:opacity-80 transition-opacity hover-glow rounded overflow-hidden"
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
                Type a card name to search
              </p>
            )}
          </>
        )}

        {/* Card Stack */}
        {cardStack.length > 0 && (
          <div className="mt-6 pt-4 border-t border-mesa-border">
            <div className="flex items-center justify-between mb-3 panel-header">
              <h3 className="text-mesa-text-secondary text-xs font-semibold uppercase tracking-wide font-fantasy">
                Scanned Cards ({cardStack.length})
              </h3>
              <button
                onClick={clearStack}
                className="text-mesa-text-secondary hover:text-mesa-red text-xs flex items-center gap-1 transition-colors"
                title="Clear all"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {cardStack.map((card) => (
                <div
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  className={`relative group w-16 rounded overflow-hidden border-2 transition-all hover-glow cursor-pointer ${
                    selectedCard?.id === card.id
                      ? 'border-mesa-gold'
                      : 'border-transparent hover:border-mesa-border'
                  }`}
                  title={card.name}
                >
                  <img
                    src={getCardImage(card, 'small')}
                    alt={card.name}
                    className="w-full"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFromStack(card.id)
                    }}
                    className="absolute top-0 right-0 bg-black/70 text-white p-0.5 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-mesa-red"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
