import type { TravelabilityFilter as FilterType } from '@/types/store'

interface TravelabilityFilterProps {
  value: FilterType
  onChange: (value: FilterType) => void
  counts: {
    total: number
    travelable: number
    nonTravelable: number
  }
}

/**
 * Filter tabs for filtering zones by travelability
 */
export function TravelabilityFilter({
  value,
  onChange,
  counts,
}: TravelabilityFilterProps) {
  const filters: { id: FilterType; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.total },
    { id: 'travelable', label: 'Travelable', count: counts.travelable },
    { id: 'non-travelable', label: 'Blocked', count: counts.nonTravelable },
  ]

  return (
    <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
      {filters.map((filter) => (
        <button
          key={filter.id}
          onClick={() => onChange(filter.id)}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            value === filter.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span>{filter.label}</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] ${
              value === filter.id
                ? filter.id === 'travelable'
                  ? 'bg-green-100 text-green-700'
                  : filter.id === 'non-travelable'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-200 text-gray-600'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {filter.count}
          </span>
        </button>
      ))}
    </div>
  )
}
