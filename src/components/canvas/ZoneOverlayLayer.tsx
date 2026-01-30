import React, { useMemo } from 'react'
import { Line, Group } from 'react-konva'
import { useProjectStore } from '@/store/useProjectStore'
import { getZoneColor, hexToRgba } from '@/utils/zoneColors'
import { getZoneStyle, getZoneStyleWithSource, shouldShowDirectionIndicator, getHatchAngle, DEFAULT_HATCH_CONFIG } from '@/utils/zoneStyles'
import { isProgrammaticZone } from '@/types/zone'
import { getCentroid } from '@/utils/geometry'
import { isTravelable } from '@/types/zone'
import { VertexHandle } from './VertexHandle'
import { HatchPattern } from './HatchPattern'
import { DirectionIndicator } from './DirectionIndicator'
import { TravelableBadge } from './TravelableBadge'
import { findClosestEdge, findClosestVertex } from '@/utils/geometry'
import type { Zone } from '@/types/zone'
import type { EditorMode } from '@/types/store'
import type { KonvaEventObject } from 'konva/lib/Node'

interface ZonePolygonProps {
  zone: Zone
  isSelected: boolean
  isHovered: boolean
  editorMode: EditorMode
  onSelect: (id: string, ctrlKey: boolean) => void
  onHover: (id: string | null) => void
  onVertexDragEnd?: (zoneId: string, vertexIndex: number, x: number, y: number) => void
  onVertexDelete?: (zoneId: string, vertexIndex: number) => void
  onEdgeClick?: (zoneId: string, edgeIndex: number, x: number, y: number) => void
  onZoneDelete?: (zoneId: string) => void
}

const ZonePolygon = React.memo(function ZonePolygon({
  zone,
  isSelected,
  isHovered,
  editorMode,
  onSelect,
  onHover,
  onVertexDragEnd,
  onVertexDelete,
  onEdgeClick,
  onZoneDelete,
}: ZonePolygonProps) {
  // Get the style based on zone type, travelability, and source
  // Use source-aware styling for programmatic zones
  const style = isProgrammaticZone(zone) ? getZoneStyleWithSource(zone) : getZoneStyle(zone)
  const baseColor = zone.metadata.color ?? getZoneColor(zone.type)
  const travelable = isTravelable(zone.type)

  // Adjust fill opacity based on state
  const getFillOpacity = () => {
    if (!zone.metadata.isVisible) return 0
    if (isSelected) return Math.min(style.opacity + 0.2, 0.8)
    if (isHovered) return Math.min(style.opacity + 0.1, 0.7)
    return style.opacity
  }

  // Get stroke style based on state
  const getStrokeWidth = () => {
    if (isSelected) return 3
    if (isHovered) return style.strokeWidth + 1
    return style.strokeWidth
  }

  const getStrokeColor = () => {
    if (isSelected) return '#FFFFFF'
    if (isHovered) return '#FFFFFF'
    return style.stroke
  }

  const getStrokeDash = () => {
    if (isSelected) return [] // Solid when selected
    return style.strokeDash
  }

  // Convert vertices to flat array for Konva Line
  const points = zone.vertices.flatMap((v) => [v.x, v.y])

  // Check if we should show direction indicator
  const showDirection = shouldShowDirectionIndicator(zone)
  const direction = zone.metadata.customProperties.direction as 'horizontal' | 'vertical' | undefined

  // Get centroid for badges
  const centroid = getCentroid(zone.vertices)

  // Handle click - either select zone or add vertex on edge
  const handleClick = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true

    // In edit_vertices mode, check if we clicked on an edge (not a vertex)
    if (editorMode === 'edit_vertices' && isSelected && !zone.metadata.isLocked) {
      const stage = e.target.getStage()
      if (stage) {
        const pointerPos = stage.getPointerPosition()
        if (pointerPos) {
          // Check if click is near a vertex first (don't add vertex if clicking existing vertex)
          const nearVertex = findClosestVertex(pointerPos, zone.vertices, 15)
          if (!nearVertex) {
            // Check if click is on an edge
            const edgeHit = findClosestEdge(pointerPos, zone.vertices, 15)
            if (edgeHit) {
              onEdgeClick?.(zone.id, edgeHit.edgeIndex, edgeHit.closestPoint.x, edgeHit.closestPoint.y)
              return
            }
          }
        }
      }
    }

    // Default behavior: select zone
    const isMultiSelect = e.evt.ctrlKey || e.evt.metaKey || e.evt.shiftKey
    onSelect(zone.id, isMultiSelect)
  }

  if (!zone.metadata.isVisible) return null

  return (
    <Group>
      {/* Main zone fill */}
      <Line
        points={points}
        closed
        fill={hexToRgba(baseColor, getFillOpacity())}
        stroke={getStrokeColor()}
        strokeWidth={getStrokeWidth()}
        dash={getStrokeDash()}
        hitStrokeWidth={10} // Easier to click
        listening={!zone.metadata.isLocked && editorMode !== 'pan'}
        onClick={handleClick}
        onDblClick={(e) => {
          // Double-click to delete zone
          e.cancelBubble = true
          if (!zone.metadata.isLocked && onZoneDelete) {
            onZoneDelete(zone.id)
          }
        }}
        onContextMenu={(e) => {
          // Right-click to delete zone
          e.cancelBubble = true
          e.evt.preventDefault()
          if (!zone.metadata.isLocked && onZoneDelete) {
            onZoneDelete(zone.id)
          }
        }}
        onTap={(e) => {
          e.cancelBubble = true
          onSelect(zone.id, false)
        }}
        onMouseEnter={() => onHover(zone.id)}
        onMouseLeave={() => onHover(null)}
      />

      {/* Hatch pattern for non-travelable zones */}
      {!travelable && style.pattern === 'hatched' && (
        <HatchPattern
          vertices={zone.vertices}
          color={style.stroke}
          spacing={DEFAULT_HATCH_CONFIG.spacing}
          angle={getHatchAngle(zone)}
          strokeWidth={DEFAULT_HATCH_CONFIG.strokeWidth}
          opacity={DEFAULT_HATCH_CONFIG.opacity}
        />
      )}

      {/* Direction indicator for zones with direction metadata */}
      {showDirection && direction && (
        <DirectionIndicator zone={zone} direction={direction} />
      )}

      {/* Travelable badge on hover */}
      {isHovered && (
        <TravelableBadge
          position={centroid}
          travelable={travelable}
          visible={true}
        />
      )}

      {/* Selection outline for better visibility */}
      {isSelected && (
        <Line
          points={points}
          closed
          stroke="#000000"
          strokeWidth={1}
          dash={[5, 5]}
          listening={false}
        />
      )}

      {/* Vertex handles - only show in edit_vertices mode for selected zones */}
      {isSelected && editorMode === 'edit_vertices' && !zone.metadata.isLocked && (
        <>
          {zone.vertices.map((vertex, index) => (
            <VertexHandle
              key={`${zone.id}-vertex-${index}`}
              x={vertex.x}
              y={vertex.y}
              index={index}
              zoneId={zone.id}
              onDragEnd={(vertexIndex, x, y) => {
                onVertexDragEnd?.(zone.id, vertexIndex, x, y)
              }}
              onDelete={(vertexIndex) => {
                onVertexDelete?.(zone.id, vertexIndex)
              }}
            />
          ))}
        </>
      )}
    </Group>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for memoization - only re-render if relevant props changed
  return (
    prevProps.zone.id === nextProps.zone.id &&
    prevProps.zone.vertices === nextProps.zone.vertices &&
    prevProps.zone.source === nextProps.zone.source &&
    prevProps.zone.metadata.isVisible === nextProps.zone.metadata.isVisible &&
    prevProps.zone.metadata.isLocked === nextProps.zone.metadata.isLocked &&
    prevProps.zone.metadata.color === nextProps.zone.metadata.color &&
    prevProps.zone.metadata.customProperties === nextProps.zone.metadata.customProperties &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isHovered === nextProps.isHovered &&
    prevProps.editorMode === nextProps.editorMode
  )
})

export function ZoneOverlayLayer() {
  const zones = useProjectStore((state) => state.zones)
  const programmaticZones = useProjectStore((state) => state.programmaticZones)
  const aiBlockedZones = useProjectStore((state) => state.aiBlockedZones)
  const selectedZoneIds = useProjectStore((state) => state.selectedZoneIds)
  const hoveredZoneId = useProjectStore((state) => state.hoveredZoneId)
  const editorMode = useProjectStore((state) => state.editorMode)
  const activeTab = useProjectStore((state) => state.activeTab)
  const selectZone = useProjectStore((state) => state.selectZone)
  const toggleZoneSelection = useProjectStore((state) => state.toggleZoneSelection)
  const setHoveredZone = useProjectStore((state) => state.setHoveredZone)
  const updateVertex = useProjectStore((state) => state.updateVertex)
  const addVertex = useProjectStore((state) => state.addVertex)
  const removeVertex = useProjectStore((state) => state.removeVertex)
  const removeZone = useProjectStore((state) => state.removeZone)
  const removeAIBlockedZone = useProjectStore((state) => state.removeAIBlockedZone)

  // Viewport state for culling off-screen zones
  const zoom = useProjectStore((state) => state.zoom)
  const panX = useProjectStore((state) => state.panX)
  const panY = useProjectStore((state) => state.panY)
  const canvasWidth = useProjectStore((state) => state.canvasWidth)
  const canvasHeight = useProjectStore((state) => state.canvasHeight)

  const handleSelect = (id: string, ctrlKey: boolean) => {
    if (ctrlKey) {
      toggleZoneSelection(id)
    } else {
      selectZone(id)
    }
  }

  const handleVertexDragEnd = (zoneId: string, vertexIndex: number, x: number, y: number) => {
    updateVertex(zoneId, vertexIndex, { x, y })
  }

  const handleVertexDelete = (zoneId: string, vertexIndex: number) => {
    removeVertex(zoneId, vertexIndex)
  }

  const handleEdgeClick = (zoneId: string, edgeIndex: number, x: number, y: number) => {
    // Add a new vertex after the edge's start vertex
    addVertex(zoneId, edgeIndex, { x, y })
  }

  const handleZoneDelete = (zoneId: string) => {
    // Find the zone to determine which store array to remove from
    const zone = [...zones, ...programmaticZones, ...aiBlockedZones].find(z => z.id === zoneId)
    if (!zone) return

    // Route to appropriate delete function based on zone source
    if (aiBlockedZones.some(z => z.id === zoneId)) {
      console.log(`[ZoneOverlayLayer] Deleting AI blocked zone: ${zone.name || zoneId}`)
      removeAIBlockedZone(zoneId)
    } else if (zones.some(z => z.id === zoneId)) {
      console.log(`[ZoneOverlayLayer] Deleting zone: ${zone.name || zoneId}`)
      removeZone(zoneId)
    } else {
      // Programmatic zones cannot be deleted (they are generated from config)
      console.log(`[ZoneOverlayLayer] Cannot delete programmatic zone: ${zone.name || zoneId}`)
    }
  }

  // Filter zones based on active tab:
  // - Pre-AI tab: Show programmatic zones only
  // - Post-AI tab: Show programmatic zones + AI blocked zones
  // - Route tab: Show all travelable zones + blocked zones (for visibility)
  const visibleZones = useMemo(() => {
    let filteredZones: Zone[] = []

    switch (activeTab) {
      case 'pre-ai':
        // Show only programmatic zones (TDOA/coverage)
        filteredZones = programmaticZones
        break
      case 'post-ai':
        // Show programmatic zones + AI blocked zones
        // This shows the combined view of travelable areas (from TDOA) with obstacles (from AI)
        filteredZones = [
          ...programmaticZones,
          ...aiBlockedZones,
          ...zones.filter(
            (z) => z.source === 'ai' || z.source === 'manual' || z.source === 'imported'
          ),
        ]
        break
      case 'route':
        // Show all travelable zones from any source + blocked zones (for visibility)
        // Blocked zones help users see what areas the route will avoid
        const allZones = [...zones, ...programmaticZones]
        const travelableZones = allZones.filter((z) => isTravelable(z.type))
        // Also include AI blocked zones so users can see obstacles
        filteredZones = [...travelableZones, ...aiBlockedZones]
        break
      default:
        filteredZones = [...zones, ...programmaticZones, ...aiBlockedZones]
    }

    // Find all zone IDs that are parents (have children referencing them)
    const parentIdsWithChildren = new Set(
      filteredZones
        .filter((z) => z.metadata.customProperties.parentZoneId)
        .map((z) => z.metadata.customProperties.parentZoneId as string)
    )

    // Filter out parent zones that have been subdivided
    return filteredZones.filter((zone) => {
      // If this zone has children and was marked for subdivision, hide it
      if (
        zone.metadata.customProperties.needsSubdivision === 'true' &&
        parentIdsWithChildren.has(zone.id)
      ) {
        return false
      }
      return true
    })
  }, [zones, programmaticZones, aiBlockedZones, activeTab])

  // Memoize sorted zones calculation with Set for O(1) lookup
  const sortedZones = useMemo(() => {
    const selectedSet = new Set(selectedZoneIds)
    return [...visibleZones].sort((a, b) => {
      const aSelected = selectedSet.has(a.id) ? 1 : 0
      const bSelected = selectedSet.has(b.id) ? 1 : 0
      return aSelected - bSelected
    })
  }, [visibleZones, selectedZoneIds])

  // Viewport culling - only render zones that are visible in the current viewport
  // This significantly improves performance for large floorplans with many zones
  const viewportCulledZones = useMemo(() => {
    // If canvas dimensions aren't set yet, show all zones
    if (canvasWidth === 0 || canvasHeight === 0) {
      return sortedZones
    }

    // Calculate visible area in image coordinates
    // panX/panY are the stage position, which is inverted from viewport position
    // At zoom level 1, the viewport shows (0,0) to (canvasWidth, canvasHeight)
    // When panned, we need to offset by -panX/zoom, -panY/zoom
    const viewportX = -panX / zoom
    const viewportY = -panY / zoom
    const viewportWidth = canvasWidth / zoom
    const viewportHeight = canvasHeight / zoom

    // Add padding to prevent zones from popping in/out at edges
    const padding = 100

    return sortedZones.filter((zone) => {
      // Get zone bounding box from its vertices
      const xs = zone.vertices.map((v) => v.x)
      const ys = zone.vertices.map((v) => v.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)

      // Check if zone's bounding box intersects with viewport (with padding)
      const intersects =
        maxX >= viewportX - padding &&
        minX <= viewportX + viewportWidth + padding &&
        maxY >= viewportY - padding &&
        minY <= viewportY + viewportHeight + padding

      return intersects
    })
  }, [sortedZones, zoom, panX, panY, canvasWidth, canvasHeight])

  // Disable zone interaction on route tab to allow click-through for placing route points
  const disableZoneInteraction = activeTab === 'route'

  return (
    <>
      {viewportCulledZones.map((zone) => (
        <ZonePolygon
          key={zone.id}
          zone={zone}
          isSelected={selectedZoneIds.includes(zone.id)}
          isHovered={hoveredZoneId === zone.id}
          editorMode={disableZoneInteraction ? 'pan' : editorMode}
          onSelect={disableZoneInteraction ? () => {} : handleSelect}
          onHover={disableZoneInteraction ? () => {} : setHoveredZone}
          onVertexDragEnd={handleVertexDragEnd}
          onVertexDelete={handleVertexDelete}
          onEdgeClick={handleEdgeClick}
          onZoneDelete={disableZoneInteraction ? undefined : handleZoneDelete}
        />
      ))}
    </>
  )
}
