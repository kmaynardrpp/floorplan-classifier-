/**
 * UI components for zone import and export operations
 */

import React, { useState, useRef, useCallback } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { useConfigStore } from '@/store/useConfigStore'
import { importZones, type ImportOptions } from '@/services/zoneImporter'
import { downloadZonesJson, type ExportConfig } from '@/services/zoneExporter'
import { createFloorplanTransformer } from '@/services/coordinateTransform'

/**
 * Props for import mode selection
 */
interface ImportModeProps {
  mode: 'replace' | 'merge'
  onChange: (mode: 'replace' | 'merge') => void
}

/**
 * Import mode radio selector
 */
function ImportModeSelector({ mode, onChange }: ImportModeProps) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="radio"
          name="importMode"
          value="replace"
          checked={mode === 'replace'}
          onChange={() => onChange('replace')}
          className="w-3 h-3"
        />
        <span>Replace all zones</span>
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="radio"
          name="importMode"
          value="merge"
          checked={mode === 'merge'}
          onChange={() => onChange('merge')}
          className="w-3 h-3"
        />
        <span>Merge with existing</span>
      </label>
    </div>
  )
}

/**
 * Zone import button with file picker
 */
export function ZoneImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showModeSelector, setShowModeSelector] = useState(false)
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )

  // Store state
  const addZones = useProjectStore((s) => s.addZones)
  const clearZones = useProjectStore((s) => s.clearZones)
  const floorplanConfig = useConfigStore((s) => s.floorplanConfig)

  const canImport = floorplanConfig !== null

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file || !floorplanConfig) return

      setIsLoading(true)
      setMessage(null)

      try {
        // Read file contents
        const text = await file.text()
        const json = JSON.parse(text)

        // Create transformer
        const transformer = createFloorplanTransformer(floorplanConfig)

        // Import zones
        const options: ImportOptions = {
          mode: importMode,
          skipDuplicates: true,
        }
        const importedZones = importZones(json, transformer, options)

        // Apply to store
        if (importMode === 'replace') {
          clearZones()
        }
        addZones(importedZones)

        setMessage({
          type: 'success',
          text: `Imported ${importedZones.length} zones`,
        })
        setShowModeSelector(false)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to import zones'
        setMessage({ type: 'error', text: errorMessage })
        console.error('[ZoneImportButton] Import failed:', err)
      } finally {
        setIsLoading(false)
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [floorplanConfig, importMode, addZones, clearZones]
  )

  const handleButtonClick = () => {
    if (showModeSelector) {
      // Trigger file picker
      fileInputRef.current?.click()
    } else {
      // Show mode selector first
      setShowModeSelector(true)
      setMessage(null)
    }
  }

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />

      <button
        onClick={handleButtonClick}
        disabled={!canImport || isLoading}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          canImport && !isLoading
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
        }`}
        title={canImport ? 'Import zones from JSON' : 'Load floorplan config first'}
      >
        {isLoading ? 'Importing...' : 'Import'}
      </button>

      {showModeSelector && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-gray-800 rounded shadow-lg z-10 min-w-[140px]">
          <ImportModeSelector mode={importMode} onChange={setImportMode} />
          <div className="flex gap-1 mt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              Select File
            </button>
            <button
              onClick={() => setShowModeSelector(false)}
              className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`absolute top-full left-0 mt-1 px-2 py-1 text-xs rounded whitespace-nowrap ${
            message.type === 'success'
              ? 'bg-green-800 text-green-200'
              : 'bg-red-800 text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  )
}

/**
 * Zone export button
 */
export function ZoneExportButton() {
  const [isExporting, setIsExporting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )

  // Store state
  const zones = useProjectStore((s) => s.zones)
  const programmaticZones = useProjectStore((s) => s.programmaticZones)
  const floorplanConfig = useConfigStore((s) => s.floorplanConfig)

  // Combine all zones for export
  const allZones = [...zones, ...programmaticZones]
  const canExport = floorplanConfig !== null && allZones.length > 0

  const handleExport = useCallback(() => {
    if (!floorplanConfig || allZones.length === 0) return

    setIsExporting(true)
    setMessage(null)

    try {
      // Create transformer
      const transformer = createFloorplanTransformer(floorplanConfig)

      // Export config
      const config: ExportConfig = {
        projectUid: '',
        sublocationUid: floorplanConfig.sublocation_uid || '',
      }

      // Download
      const filename = `zones_${new Date().toISOString().slice(0, 10)}.json`
      downloadZonesJson(allZones, transformer, filename, config)

      setMessage({
        type: 'success',
        text: `Exported ${allZones.length} zones`,
      })
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to export zones'
      setMessage({ type: 'error', text: errorMessage })
      console.error('[ZoneExportButton] Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }, [floorplanConfig, allZones])

  // Clear message after timeout
  React.useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [message])

  return (
    <div className="relative">
      <button
        onClick={handleExport}
        disabled={!canExport || isExporting}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          canExport && !isExporting
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
        }`}
        title={
          !floorplanConfig
            ? 'Load floorplan config first'
            : allZones.length === 0
              ? 'No zones to export'
              : `Export ${allZones.length} zones to JSON`
        }
      >
        {isExporting ? 'Exporting...' : `Export (${allZones.length})`}
      </button>

      {message && (
        <div
          className={`absolute top-full right-0 mt-1 px-2 py-1 text-xs rounded whitespace-nowrap ${
            message.type === 'success'
              ? 'bg-green-800 text-green-200'
              : 'bg-red-800 text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  )
}

/**
 * Combined import/export toolbar
 */
export function ZoneImportExport() {
  return (
    <div className="flex items-center gap-2">
      <ZoneImportButton />
      <ZoneExportButton />
    </div>
  )
}
