import { useState, useCallback, useEffect, useRef } from 'react'
import { PREDEFINED_ZONE_TYPES, type ZoneType } from '@/types/zone'
import { ZONE_COLORS, getZoneTypeLabel } from '@/utils/zoneColors'

interface ZoneTypeSelectorProps {
  onSelect: (type: ZoneType) => void
  onCancel: () => void
  position?: { x: number; y: number }
}

export function ZoneTypeSelector({ onSelect, onCancel, position }: ZoneTypeSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : PREDEFINED_ZONE_TYPES.length - 1
          )
          break
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) =>
            prev < PREDEFINED_ZONE_TYPES.length - 1 ? prev + 1 : 0
          )
          break
        case 'Enter':
          e.preventDefault()
          const type = PREDEFINED_ZONE_TYPES[selectedIndex]
          if (type) {
            onSelect(type)
          }
          break
        case 'Escape':
          e.preventDefault()
          onCancel()
          break
      }
    },
    [selectedIndex, onSelect, onCancel]
  )

  // Add keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Focus container on mount
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onCancel])

  const style: React.CSSProperties = position
    ? {
        position: 'fixed',
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
      }
    : {}

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-lg shadow-xl border border-gray-200 p-2 w-64 max-h-80 overflow-y-auto z-50"
      style={style}
      tabIndex={0}
    >
      <div className="text-sm font-medium text-gray-700 px-2 py-1 border-b border-gray-200 mb-1">
        Select Zone Type
      </div>
      <div className="space-y-0.5">
        {PREDEFINED_ZONE_TYPES.map((type, index) => {
          const color = ZONE_COLORS[type]
          const isSelected = index === selectedIndex
          return (
            <button
              key={type}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                isSelected
                  ? 'bg-blue-100 text-blue-900'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
              onClick={() => onSelect(type)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span
                className="w-4 h-4 rounded-sm flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm">{getZoneTypeLabel(type)}</span>
            </button>
          )
        })}
      </div>
      <div className="border-t border-gray-200 mt-1 pt-1">
        <button
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-gray-500 hover:bg-gray-100"
          onClick={onCancel}
        >
          <span className="text-sm">Cancel (Esc)</span>
        </button>
      </div>
    </div>
  )
}
