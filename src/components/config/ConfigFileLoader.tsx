/**
 * Component for loading TDOA/anchor configuration files
 */

import { useRef, useCallback, useState } from 'react'
import { useConfigStore } from '@/store/useConfigStore'
import { parseFloorplanConfig, FloorplanParseError } from '@/services/floorplanParser'
import { parseAnchors } from '@/services/anchorParser'
import { parseTDOAPairs, CSVParseError } from '@/services/tdoaParser'
import { parseCoveragePolygons } from '@/services/coverageParser'

/**
 * File type configuration
 */
interface FileTypeConfig {
  id: string
  label: string
  accept: string
  description: string
}

const FILE_TYPES: FileTypeConfig[] = [
  {
    id: 'floorplan',
    label: 'Floorplan Config',
    accept: '.json',
    description: 'floorplans.json',
  },
  {
    id: 'anchors',
    label: 'Anchors',
    accept: '.json',
    description: 'win_anchors.json',
  },
  {
    id: 'tdoa',
    label: 'TDOA Schedule',
    accept: '.csv',
    description: 'schedule.csv',
  },
  {
    id: 'coverage',
    label: 'Coverage',
    accept: '.json',
    description: 'coverage.json',
  },
]

/**
 * Status indicator component
 */
function StatusIndicator({
  status,
}: {
  status: 'empty' | 'loaded' | 'error'
}) {
  if (status === 'loaded') {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white">
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white">
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </div>
    )
  }

  return (
    <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
  )
}

/**
 * Single file input row
 */
function FileInputRow({
  config,
  status,
  filename,
  count,
  onFileSelect,
  isLoading,
}: {
  config: FileTypeConfig
  status: 'empty' | 'loaded' | 'error'
  filename: string | null
  count: string | null
  onFileSelect: (file: File) => void
  isLoading: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) {
        onFileSelect(file)
      }
      event.target.value = ''
    },
    [onFileSelect]
  )

  return (
    <div className="flex items-center gap-2 py-1">
      <StatusIndicator status={status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 truncate">
            {config.label}:
          </span>
          {filename ? (
            <span className="text-sm text-gray-500 truncate" title={filename}>
              {filename}
            </span>
          ) : (
            <span className="text-sm text-gray-400">{config.description}</span>
          )}
        </div>
        {count && (
          <span className="text-xs text-gray-500">{count}</span>
        )}
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? '...' : 'Choose'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={config.accept}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}

/**
 * Main ConfigFileLoader component
 */
export function ConfigFileLoader() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [loadingFile, setLoadingFile] = useState<string | null>(null)
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({})

  // Store state
  const floorplanConfig = useConfigStore((s) => s.floorplanConfig)
  const anchors = useConfigStore((s) => s.anchors)
  const tdoaPairs = useConfigStore((s) => s.tdoaPairs)
  const coveragePolygons = useConfigStore((s) => s.coveragePolygons)
  const loadErrors = useConfigStore((s) => s.loadErrors)

  // Store actions
  const setFloorplanConfig = useConfigStore((s) => s.setFloorplanConfig)
  const setAnchors = useConfigStore((s) => s.setAnchors)
  const setTDOAPairs = useConfigStore((s) => s.setTDOAPairs)
  const setCoveragePolygons = useConfigStore((s) => s.setCoveragePolygons)
  const addError = useConfigStore((s) => s.addError)
  const clearAll = useConfigStore((s) => s.clearAll)
  const clearErrors = useConfigStore((s) => s.clearErrors)

  // Get 1D and 2D counts for TDOA
  const tdoa1DCount = tdoaPairs.filter((p) => p.Dimension === '1D').length
  const tdoa2DCount = tdoaPairs.filter((p) => p.Dimension === '2D').length

  // Status and count for each file type
  const getStatus = (id: string): 'empty' | 'loaded' | 'error' => {
    if (fileErrors[id]) return 'error'
    switch (id) {
      case 'floorplan':
        return floorplanConfig ? 'loaded' : 'empty'
      case 'anchors':
        return anchors.size > 0 ? 'loaded' : 'empty'
      case 'tdoa':
        return tdoaPairs.length > 0 ? 'loaded' : 'empty'
      case 'coverage':
        return coveragePolygons.length > 0 ? 'loaded' : 'empty'
      default:
        return 'empty'
    }
  }

  const getCount = (id: string): string | null => {
    switch (id) {
      case 'anchors':
        return anchors.size > 0 ? `${anchors.size} anchors` : null
      case 'tdoa':
        return tdoaPairs.length > 0
          ? `${tdoaPairs.length} pairs (${tdoa1DCount} 1D, ${tdoa2DCount} 2D)`
          : null
      case 'coverage':
        return coveragePolygons.length > 0
          ? `${coveragePolygons.length} polygons`
          : null
      default:
        return null
    }
  }

  const getFilename = (id: string): string | null => {
    switch (id) {
      case 'floorplan':
        return floorplanConfig?.filename || null
      default:
        return null
    }
  }

  // File handlers
  const handleFileSelect = useCallback(
    async (fileType: string, file: File) => {
      setLoadingFile(fileType)
      setFileErrors((prev) => ({ ...prev, [fileType]: '' }))

      try {
        const text = await file.text()

        switch (fileType) {
          case 'floorplan': {
            const json = JSON.parse(text)
            const config = parseFloorplanConfig(json)
            setFloorplanConfig(config)
            break
          }
          case 'anchors': {
            const json = JSON.parse(text)
            const anchorMap = parseAnchors(json)
            setAnchors(anchorMap)
            break
          }
          case 'tdoa': {
            const pairs = parseTDOAPairs(text)
            setTDOAPairs(pairs)
            break
          }
          case 'coverage': {
            const json = JSON.parse(text)
            const polygons = parseCoveragePolygons(json)
            setCoveragePolygons(polygons)
            break
          }
        }
      } catch (error) {
        let message = 'Failed to parse file'
        if (error instanceof FloorplanParseError) {
          message = error.message
        } else if (error instanceof CSVParseError) {
          message = error.message
        } else if (error instanceof SyntaxError) {
          message = 'Invalid JSON format'
        } else if (error instanceof Error) {
          message = error.message
        }
        setFileErrors((prev) => ({ ...prev, [fileType]: message }))
        addError(`${fileType}: ${message}`)
      } finally {
        setLoadingFile(null)
      }
    },
    [setFloorplanConfig, setAnchors, setTDOAPairs, setCoveragePolygons, addError]
  )

  const handleClearAll = useCallback(() => {
    clearAll()
    setFileErrors({})
  }, [clearAll])

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  // Load default files from public/defaults
  const handleLoadDefaults = useCallback(async () => {
    setLoadingFile('defaults')
    setFileErrors({})
    clearErrors()

    try {
      // Load floorplans.json
      const floorplanRes = await fetch('/defaults/floorplans.json')
      if (floorplanRes.ok) {
        const json = await floorplanRes.json()
        const config = parseFloorplanConfig(json)
        setFloorplanConfig(config)
      }

      // Load win_anchors.json
      const anchorsRes = await fetch('/defaults/win_anchors.json')
      if (anchorsRes.ok) {
        const json = await anchorsRes.json()
        const anchorMap = parseAnchors(json)
        setAnchors(anchorMap)
      }

      // Load schedule.csv
      const tdoaRes = await fetch('/defaults/schedule.csv')
      if (tdoaRes.ok) {
        const text = await tdoaRes.text()
        const pairs = parseTDOAPairs(text)
        setTDOAPairs(pairs)
      }

      // Load coverage.json
      const coverageRes = await fetch('/defaults/coverage.json')
      if (coverageRes.ok) {
        const json = await coverageRes.json()
        const polygons = parseCoveragePolygons(json)
        setCoveragePolygons(polygons)
      }

      console.log('[ConfigFileLoader] Default files loaded successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load defaults'
      addError(`Load defaults: ${message}`)
      console.error('[ConfigFileLoader] Error loading defaults:', error)
    } finally {
      setLoadingFile(null)
    }
  }, [setFloorplanConfig, setAnchors, setTDOAPairs, setCoveragePolygons, addError, clearErrors])

  // Count loaded files
  const loadedCount = [
    floorplanConfig,
    anchors.size > 0,
    tdoaPairs.length > 0,
    coveragePolygons.length > 0,
  ].filter(Boolean).length

  return (
    <div className="border-b border-gray-200">
      {/* Header */}
      <button
        type="button"
        onClick={toggleExpanded}
        className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 text-gray-500 transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          <span className="text-sm font-medium text-gray-700">
            Configuration Files
          </span>
        </div>
        <span className="text-xs text-gray-500">{loadedCount}/4 loaded</span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-3">
          {/* File inputs */}
          <div className="space-y-1">
            {FILE_TYPES.map((config) => (
              <FileInputRow
                key={config.id}
                config={config}
                status={getStatus(config.id)}
                filename={getFilename(config.id)}
                count={getCount(config.id)}
                onFileSelect={(file) => handleFileSelect(config.id, file)}
                isLoading={loadingFile === config.id}
              />
            ))}
          </div>

          {/* Error display */}
          {loadErrors.length > 0 && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
              {loadErrors.map((error, i) => (
                <div key={i}>{error}</div>
              ))}
              <button
                type="button"
                onClick={clearErrors}
                className="mt-1 text-red-500 hover:text-red-700 underline"
              >
                Clear errors
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleLoadDefaults}
              disabled={loadingFile === 'defaults'}
              className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingFile === 'defaults' ? 'Loading...' : 'Load Defaults'}
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={loadedCount === 0}
              className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear All
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
