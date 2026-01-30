import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from './useProjectStore'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT, ZOOM_STEP } from '@/types/store'
import { createZone } from '@/types/zone'

describe('useProjectStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useProjectStore.setState({
      dataUrl: null,
      filename: null,
      width: 0,
      height: 0,
      originalSize: 0,
      zoom: ZOOM_DEFAULT,
      panX: 0,
      panY: 0,
      canvasWidth: 0,
      canvasHeight: 0,
      zones: [],
      selectedZoneIds: [],
      hoveredZoneId: null,
      analysisStatus: 'idle',
      analysisError: null,
    })
  })

  describe('viewport actions', () => {
    it('should initialize with default zoom', () => {
      const { zoom } = useProjectStore.getState()
      expect(zoom).toBe(ZOOM_DEFAULT)
    })

    it('should set zoom within bounds', () => {
      const { setZoom } = useProjectStore.getState()

      setZoom(2.0)
      expect(useProjectStore.getState().zoom).toBe(2.0)

      setZoom(0.05) // below min
      expect(useProjectStore.getState().zoom).toBe(ZOOM_MIN)

      setZoom(10) // above max
      expect(useProjectStore.getState().zoom).toBe(ZOOM_MAX)
    })

    it('should zoom in by step', () => {
      const { zoomIn } = useProjectStore.getState()

      zoomIn()
      expect(useProjectStore.getState().zoom).toBeCloseTo(
        ZOOM_DEFAULT + ZOOM_STEP
      )
    })

    it('should zoom out by step', () => {
      const { zoomOut, setZoom } = useProjectStore.getState()

      setZoom(1.5)
      zoomOut()
      expect(useProjectStore.getState().zoom).toBeCloseTo(1.5 - ZOOM_STEP)
    })

    it('should not zoom below minimum', () => {
      const { setZoom, zoomOut } = useProjectStore.getState()

      setZoom(ZOOM_MIN)
      zoomOut()
      expect(useProjectStore.getState().zoom).toBe(ZOOM_MIN)
    })

    it('should not zoom above maximum', () => {
      const { setZoom, zoomIn } = useProjectStore.getState()

      setZoom(ZOOM_MAX)
      zoomIn()
      expect(useProjectStore.getState().zoom).toBe(ZOOM_MAX)
    })

    it('should reset zoom to default', () => {
      const { setZoom, resetZoom } = useProjectStore.getState()

      setZoom(3.0)
      resetZoom()
      expect(useProjectStore.getState().zoom).toBe(ZOOM_DEFAULT)
    })

    it('should set pan position', () => {
      const { setPan } = useProjectStore.getState()

      setPan(100, 200)
      const state = useProjectStore.getState()
      expect(state.panX).toBe(100)
      expect(state.panY).toBe(200)
    })

    it('should adjust pan by delta', () => {
      const { setPan, adjustPan } = useProjectStore.getState()

      setPan(100, 100)
      adjustPan(50, -30)

      const state = useProjectStore.getState()
      expect(state.panX).toBe(150)
      expect(state.panY).toBe(70)
    })

    it('should set canvas size', () => {
      const { setCanvasSize } = useProjectStore.getState()

      setCanvasSize(800, 600)
      const state = useProjectStore.getState()
      expect(state.canvasWidth).toBe(800)
      expect(state.canvasHeight).toBe(600)
    })

    it('should reset viewport completely', () => {
      const { setZoom, setPan, resetViewport } = useProjectStore.getState()

      setZoom(2.5)
      setPan(200, 300)
      resetViewport()

      const state = useProjectStore.getState()
      expect(state.zoom).toBe(ZOOM_DEFAULT)
      expect(state.panX).toBe(0)
      expect(state.panY).toBe(0)
    })
  })

  describe('image actions', () => {
    it('should initialize with no image', () => {
      const { dataUrl, filename } = useProjectStore.getState()
      expect(dataUrl).toBeNull()
      expect(filename).toBeNull()
    })

    it('should clear image and reset viewport', () => {
      const { clearImage } = useProjectStore.getState()

      // Set some state first
      useProjectStore.setState({
        dataUrl: 'data:image/png;base64,test',
        filename: 'test.png',
        width: 100,
        height: 100,
        originalSize: 1000,
        zoom: 2.0,
        panX: 50,
        panY: 50,
      })

      clearImage()

      const state = useProjectStore.getState()
      expect(state.dataUrl).toBeNull()
      expect(state.filename).toBeNull()
      expect(state.width).toBe(0)
      expect(state.height).toBe(0)
      expect(state.originalSize).toBe(0)
      expect(state.zoom).toBe(ZOOM_DEFAULT)
      expect(state.panX).toBe(0)
      expect(state.panY).toBe(0)
    })

    it('should clear zones and selection when clearing image', () => {
      const { clearImage, addZone, selectZone } = useProjectStore.getState()

      const zone = createZone({
        id: 'zone-1',
        name: 'Test Zone',
        type: 'aisle',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
      })
      addZone(zone)
      selectZone('zone-1')

      clearImage()

      const state = useProjectStore.getState()
      expect(state.zones).toHaveLength(0)
      expect(state.selectedZoneIds).toHaveLength(0)
      expect(state.analysisStatus).toBe('idle')
    })
  })

  describe('zones actions', () => {
    const createTestZone = (id: string, type = 'aisle', source: 'ai' | 'manual' = 'manual') =>
      createZone({
        id,
        name: `Test Zone ${id}`,
        type,
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        source,
      })

    it('should add a zone', () => {
      const { addZone } = useProjectStore.getState()
      const zone = createTestZone('zone-1')

      addZone(zone)

      expect(useProjectStore.getState().zones).toHaveLength(1)
      expect(useProjectStore.getState().zones[0]!.id).toBe('zone-1')
    })

    it('should add multiple zones', () => {
      const { addZones } = useProjectStore.getState()
      const zones = [createTestZone('zone-1'), createTestZone('zone-2')]

      addZones(zones)

      expect(useProjectStore.getState().zones).toHaveLength(2)
    })

    it('should update a zone', async () => {
      const { addZone, updateZone } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))

      const originalUpdatedAt = useProjectStore.getState().zones[0]!.updatedAt

      // Wait a small amount to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 5))

      updateZone('zone-1', { name: 'Updated Zone' })

      const state = useProjectStore.getState()
      expect(state.zones[0]!.name).toBe('Updated Zone')
      expect(state.zones[0]!.updatedAt).not.toBe(originalUpdatedAt)
    })

    it('should remove a zone', () => {
      const { addZone, removeZone, selectZone } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))
      selectZone('zone-1')

      removeZone('zone-1')

      const state = useProjectStore.getState()
      expect(state.zones).toHaveLength(0)
      expect(state.selectedZoneIds).not.toContain('zone-1')
    })

    it('should remove multiple zones', () => {
      const { addZones, removeZones, selectZones } = useProjectStore.getState()
      addZones([createTestZone('zone-1'), createTestZone('zone-2'), createTestZone('zone-3')])
      selectZones(['zone-1', 'zone-2'])

      removeZones(['zone-1', 'zone-2'])

      const state = useProjectStore.getState()
      expect(state.zones).toHaveLength(1)
      expect(state.zones[0]!.id).toBe('zone-3')
      expect(state.selectedZoneIds).toHaveLength(0)
    })

    it('should clear all zones', () => {
      const { addZones, clearZones, selectZone } = useProjectStore.getState()
      addZones([createTestZone('zone-1'), createTestZone('zone-2')])
      selectZone('zone-1')

      clearZones()

      const state = useProjectStore.getState()
      expect(state.zones).toHaveLength(0)
      expect(state.selectedZoneIds).toHaveLength(0)
    })

    it('should set zones from analysis (replacing AI zones)', () => {
      const { addZones, setZonesFromAnalysis } = useProjectStore.getState()

      // Add some manual and AI zones
      addZones([
        createTestZone('manual-1', 'aisle', 'manual'),
        createTestZone('ai-1', 'travel_lane', 'ai'),
      ])

      // Set new AI zones
      const newAiZones = [
        createTestZone('new-ai-1', 'parking_lot', 'ai'),
        createTestZone('new-ai-2', 'open_floor', 'ai'),
      ]
      setZonesFromAnalysis(newAiZones)

      const state = useProjectStore.getState()
      expect(state.zones).toHaveLength(3) // 1 manual + 2 new AI
      expect(state.zones.filter((z) => z.source === 'manual')).toHaveLength(1)
      expect(state.zones.filter((z) => z.source === 'ai')).toHaveLength(2)
    })

    describe('vertex operations', () => {
      it('should update a vertex', () => {
        const { addZone, updateVertex } = useProjectStore.getState()
        addZone(createTestZone('zone-1'))

        updateVertex('zone-1', 0, { x: 50, y: 50 })

        const state = useProjectStore.getState()
        expect(state.zones[0]!.vertices[0]).toEqual({ x: 50, y: 50 })
      })

      it('should add a vertex', () => {
        const { addZone, addVertex } = useProjectStore.getState()
        addZone(createTestZone('zone-1'))

        addVertex('zone-1', 0, { x: 50, y: 0 })

        const state = useProjectStore.getState()
        expect(state.zones[0]!.vertices).toHaveLength(4)
        expect(state.zones[0]!.vertices[1]).toEqual({ x: 50, y: 0 })
      })

      it('should remove a vertex (maintaining minimum 3)', () => {
        const { addZone, removeVertex } = useProjectStore.getState()
        const zone = createZone({
          id: 'zone-1',
          name: 'Test',
          type: 'aisle',
          vertices: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
        })
        addZone(zone)

        removeVertex('zone-1', 0)

        expect(useProjectStore.getState().zones[0]!.vertices).toHaveLength(3)
      })

      it('should not remove vertex if only 3 remain', () => {
        const { addZone, removeVertex } = useProjectStore.getState()
        addZone(createTestZone('zone-1')) // has 3 vertices

        removeVertex('zone-1', 0)

        expect(useProjectStore.getState().zones[0]!.vertices).toHaveLength(3)
      })
    })
  })

  describe('selection actions', () => {
    const createTestZone = (id: string) =>
      createZone({
        id,
        name: `Test Zone ${id}`,
        type: 'aisle',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
      })

    beforeEach(() => {
      const { addZones } = useProjectStore.getState()
      addZones([createTestZone('zone-1'), createTestZone('zone-2'), createTestZone('zone-3')])
    })

    it('should select a zone', () => {
      const { selectZone } = useProjectStore.getState()

      selectZone('zone-1')

      expect(useProjectStore.getState().selectedZoneIds).toEqual(['zone-1'])
    })

    it('should select multiple zones', () => {
      const { selectZones } = useProjectStore.getState()

      selectZones(['zone-1', 'zone-2'])

      expect(useProjectStore.getState().selectedZoneIds).toEqual(['zone-1', 'zone-2'])
    })

    it('should toggle zone selection', () => {
      const { toggleZoneSelection } = useProjectStore.getState()

      toggleZoneSelection('zone-1')
      expect(useProjectStore.getState().selectedZoneIds).toContain('zone-1')

      toggleZoneSelection('zone-1')
      expect(useProjectStore.getState().selectedZoneIds).not.toContain('zone-1')
    })

    it('should deselect a zone', () => {
      const { selectZones, deselectZone } = useProjectStore.getState()
      selectZones(['zone-1', 'zone-2'])

      deselectZone('zone-1')

      expect(useProjectStore.getState().selectedZoneIds).toEqual(['zone-2'])
    })

    it('should clear selection', () => {
      const { selectZones, clearSelection } = useProjectStore.getState()
      selectZones(['zone-1', 'zone-2'])

      clearSelection()

      expect(useProjectStore.getState().selectedZoneIds).toHaveLength(0)
    })

    it('should set hovered zone', () => {
      const { setHoveredZone } = useProjectStore.getState()

      setHoveredZone('zone-1')
      expect(useProjectStore.getState().hoveredZoneId).toBe('zone-1')

      setHoveredZone(null)
      expect(useProjectStore.getState().hoveredZoneId).toBeNull()
    })
  })

  describe('analysis actions', () => {
    it('should start analysis', () => {
      const { startAnalysis } = useProjectStore.getState()

      startAnalysis()

      const state = useProjectStore.getState()
      expect(state.analysisStatus).toBe('analyzing')
      expect(state.analysisError).toBeNull()
    })

    it('should complete analysis', () => {
      const { startAnalysis, completeAnalysis } = useProjectStore.getState()
      startAnalysis()

      completeAnalysis()

      expect(useProjectStore.getState().analysisStatus).toBe('success')
    })

    it('should fail analysis with error', () => {
      const { startAnalysis, failAnalysis } = useProjectStore.getState()
      startAnalysis()

      failAnalysis('Network error')

      const state = useProjectStore.getState()
      expect(state.analysisStatus).toBe('error')
      expect(state.analysisError).toBe('Network error')
    })

    it('should reset analysis state', () => {
      const { failAnalysis, resetAnalysis } = useProjectStore.getState()
      failAnalysis('Some error')

      resetAnalysis()

      const state = useProjectStore.getState()
      expect(state.analysisStatus).toBe('idle')
      expect(state.analysisError).toBeNull()
    })

    it('should set analysis status directly', () => {
      const { setAnalysisStatus } = useProjectStore.getState()

      setAnalysisStatus('analyzing')
      expect(useProjectStore.getState().analysisStatus).toBe('analyzing')

      setAnalysisStatus('success')
      expect(useProjectStore.getState().analysisStatus).toBe('success')
    })

    it('should set analysis error directly', () => {
      const { setAnalysisError } = useProjectStore.getState()

      setAnalysisError('Custom error')
      expect(useProjectStore.getState().analysisError).toBe('Custom error')

      setAnalysisError(null)
      expect(useProjectStore.getState().analysisError).toBeNull()
    })
  })

  describe('editor mode actions', () => {
    it('should initialize with select mode', () => {
      const { editorMode } = useProjectStore.getState()
      expect(editorMode).toBe('select')
    })

    it('should set editor mode to pan', () => {
      const { setEditorMode } = useProjectStore.getState()

      setEditorMode('pan')
      expect(useProjectStore.getState().editorMode).toBe('pan')
    })

    it('should set editor mode to draw_polygon', () => {
      const { setEditorMode } = useProjectStore.getState()

      setEditorMode('draw_polygon')
      expect(useProjectStore.getState().editorMode).toBe('draw_polygon')
    })

    it('should set editor mode to draw_rect', () => {
      const { setEditorMode } = useProjectStore.getState()

      setEditorMode('draw_rect')
      expect(useProjectStore.getState().editorMode).toBe('draw_rect')
    })

    it('should set editor mode to edit_vertices', () => {
      const { setEditorMode } = useProjectStore.getState()

      setEditorMode('edit_vertices')
      expect(useProjectStore.getState().editorMode).toBe('edit_vertices')
    })

    it('should set editor mode back to select', () => {
      const { setEditorMode } = useProjectStore.getState()

      setEditorMode('pan')
      setEditorMode('select')
      expect(useProjectStore.getState().editorMode).toBe('select')
    })
  })

  describe('history actions', () => {
    const createTestZone = (id: string) =>
      createZone({
        id,
        name: `Test Zone ${id}`,
        type: 'aisle',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
      })

    beforeEach(() => {
      useProjectStore.setState({
        history: [],
        historyIndex: -1,
        zones: [],
        selectedZoneIds: [],
        hoveredZoneId: null,
      })
    })

    it('should push history manually', () => {
      const { pushHistory } = useProjectStore.getState()

      // Manually set some zones first
      useProjectStore.setState({ zones: [createTestZone('zone-1')] })
      pushHistory()

      const state = useProjectStore.getState()
      expect(state.history).toHaveLength(1)
      expect(state.historyIndex).toBe(0)
      expect(state.history[0]!.zones).toHaveLength(1)
    })

    it('should clear history', () => {
      const { addZone, clearHistory } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))
      addZone(createTestZone('zone-2'))

      clearHistory()

      const state = useProjectStore.getState()
      expect(state.history).toHaveLength(0)
      expect(state.historyIndex).toBe(-1)
    })

    it('should not undo when at beginning of history', () => {
      const { addZone, undo } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))

      // History index is 0, can't go back further
      undo()

      const state = useProjectStore.getState()
      expect(state.historyIndex).toBe(0)
      expect(state.zones).toHaveLength(1)
    })

    it('should not redo when at end of history', () => {
      const { addZone, redo } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))

      // Already at the end, redo should do nothing
      redo()

      const state = useProjectStore.getState()
      expect(state.historyIndex).toBe(0)
      expect(state.zones).toHaveLength(1)
    })

    it('should clear selection when undoing', () => {
      const { addZone, updateZone, selectZone, undo } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))
      selectZone('zone-1')
      updateZone('zone-1', { name: 'Updated' })

      expect(useProjectStore.getState().selectedZoneIds).toContain('zone-1')

      undo()

      expect(useProjectStore.getState().selectedZoneIds).toHaveLength(0)
    })

    it('should clear selection when redoing', () => {
      const { addZone, updateZone, selectZone, undo, redo } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))
      updateZone('zone-1', { name: 'Updated' })
      undo()
      selectZone('zone-1')

      expect(useProjectStore.getState().selectedZoneIds).toContain('zone-1')

      redo()

      expect(useProjectStore.getState().selectedZoneIds).toHaveLength(0)
    })

    it('should include timestamp in history entry', () => {
      const { addZone } = useProjectStore.getState()
      const beforeTime = Date.now()

      addZone(createTestZone('zone-1'))

      const state = useProjectStore.getState()
      expect(state.history[0]!.timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(state.history[0]!.timestamp).toBeLessThanOrEqual(Date.now())
    })
  })

  describe('history recording middleware', () => {
    const createTestZone = (id: string) =>
      createZone({
        id,
        name: `Test Zone ${id}`,
        type: 'aisle',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
      })

    beforeEach(() => {
      // Reset history state
      useProjectStore.setState({
        history: [],
        historyIndex: -1,
        zones: [],
        selectedZoneIds: [],
        hoveredZoneId: null,
      })
    })

    it('should record history when adding a zone', () => {
      const { addZone } = useProjectStore.getState()
      const zone = createTestZone('zone-1')

      addZone(zone)

      const state = useProjectStore.getState()
      expect(state.history).toHaveLength(1)
      expect(state.historyIndex).toBe(0)
      // History should contain the state AFTER the action (1 zone)
      expect(state.history[0]!.zones).toHaveLength(1)
    })

    it('should record history when adding multiple zones', () => {
      const { addZones } = useProjectStore.getState()
      const zones = [createTestZone('zone-1'), createTestZone('zone-2')]

      addZones(zones)

      const state = useProjectStore.getState()
      expect(state.history).toHaveLength(1)
      expect(state.historyIndex).toBe(0)
      expect(state.history[0]!.zones).toHaveLength(2)
    })

    it('should record history when updating a zone', () => {
      const { addZone, updateZone } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))

      updateZone('zone-1', { name: 'Updated Zone' })

      const state = useProjectStore.getState()
      // 2 history entries: after addZone, after updateZone
      expect(state.history).toHaveLength(2)
      expect(state.historyIndex).toBe(1)
      // First history entry should have the zone with original name
      expect(state.history[0]!.zones[0]!.name).toBe('Test Zone zone-1')
      // Second history entry should have the zone with updated name
      expect(state.history[1]!.zones[0]!.name).toBe('Updated Zone')
    })

    it('should record history when removing a zone', () => {
      const { addZone, removeZone } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))

      removeZone('zone-1')

      const state = useProjectStore.getState()
      expect(state.history).toHaveLength(2)
      expect(state.historyIndex).toBe(1)
      // First entry should have 1 zone, second should be empty
      expect(state.history[0]!.zones).toHaveLength(1)
      expect(state.history[1]!.zones).toHaveLength(0)
    })

    it('should record history when clearing zones', () => {
      const { addZones, clearZones } = useProjectStore.getState()
      addZones([createTestZone('zone-1'), createTestZone('zone-2')])

      clearZones()

      const state = useProjectStore.getState()
      expect(state.history).toHaveLength(2)
      // First entry should have 2 zones
      expect(state.history[0]!.zones).toHaveLength(2)
      // Second entry should be empty
      expect(state.history[1]!.zones).toHaveLength(0)
    })

    it('should record history when updating a vertex', () => {
      const { addZone, updateVertex } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))

      updateVertex('zone-1', 0, { x: 50, y: 50 })

      const state = useProjectStore.getState()
      expect(state.history).toHaveLength(2)
      // First entry should have the original vertex
      expect(state.history[0]!.zones[0]!.vertices[0]).toEqual({ x: 0, y: 0 })
      // Second entry should have the updated vertex
      expect(state.history[1]!.zones[0]!.vertices[0]).toEqual({ x: 50, y: 50 })
    })

    it('should support undo after recording history', () => {
      const { addZone, updateZone, undo } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))
      updateZone('zone-1', { name: 'Updated Zone' })

      // Current state should have updated name
      expect(useProjectStore.getState().zones[0]!.name).toBe('Updated Zone')

      undo()

      // After undo, should have original name
      expect(useProjectStore.getState().zones[0]!.name).toBe('Test Zone zone-1')
    })

    it('should support redo after undo', () => {
      const { addZone, updateZone, undo, redo } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))
      updateZone('zone-1', { name: 'Updated Zone' })

      undo()
      expect(useProjectStore.getState().zones[0]!.name).toBe('Test Zone zone-1')

      redo()
      expect(useProjectStore.getState().zones[0]!.name).toBe('Updated Zone')
    })

    it('should truncate forward history when new action is taken after undo', () => {
      const { addZone, updateZone, undo } = useProjectStore.getState()
      addZone(createTestZone('zone-1'))
      updateZone('zone-1', { name: 'Update 1' })
      updateZone('zone-1', { name: 'Update 2' })

      // History: [original, Update 1, Update 2]
      expect(useProjectStore.getState().history).toHaveLength(3)
      expect(useProjectStore.getState().historyIndex).toBe(2)

      undo() // Go back to Update 1
      expect(useProjectStore.getState().historyIndex).toBe(1)
      undo() // Go back to original name
      expect(useProjectStore.getState().historyIndex).toBe(0)

      // Now make a new action - should truncate forward history
      updateZone('zone-1', { name: 'New Update' })

      const state = useProjectStore.getState()
      // Should only have: [original name, New Update]
      expect(state.history).toHaveLength(2)
      expect(state.historyIndex).toBe(1)
      expect(state.zones[0]!.name).toBe('New Update')
      expect(state.history[0]!.zones[0]!.name).toBe('Test Zone zone-1')
      expect(state.history[1]!.zones[0]!.name).toBe('New Update')
    })
  })

  describe('drawing actions', () => {
    beforeEach(() => {
      useProjectStore.setState({
        drawingMode: null,
        drawingVertices: [],
        drawingStartPoint: null,
      })
    })

    it('should start polygon drawing', () => {
      const { startDrawing } = useProjectStore.getState()
      const startPoint = { x: 100, y: 100 }

      startDrawing('polygon', startPoint)

      const state = useProjectStore.getState()
      expect(state.drawingMode).toBe('polygon')
      expect(state.drawingVertices).toEqual([startPoint])
      expect(state.drawingStartPoint).toEqual(startPoint)
    })

    it('should start rect drawing', () => {
      const { startDrawing } = useProjectStore.getState()
      const startPoint = { x: 50, y: 50 }

      startDrawing('rect', startPoint)

      const state = useProjectStore.getState()
      expect(state.drawingMode).toBe('rect')
      expect(state.drawingVertices).toEqual([startPoint])
      expect(state.drawingStartPoint).toEqual(startPoint)
    })

    it('should add drawing vertex', () => {
      const { startDrawing, addDrawingVertex } = useProjectStore.getState()
      startDrawing('polygon', { x: 0, y: 0 })

      addDrawingVertex({ x: 100, y: 0 })
      addDrawingVertex({ x: 100, y: 100 })

      const state = useProjectStore.getState()
      expect(state.drawingVertices).toHaveLength(3)
      expect(state.drawingVertices).toEqual([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ])
    })

    it('should not add vertex when not drawing', () => {
      const { addDrawingVertex } = useProjectStore.getState()

      addDrawingVertex({ x: 100, y: 100 })

      const state = useProjectStore.getState()
      expect(state.drawingVertices).toHaveLength(0)
    })

    it('should complete polygon drawing with 3+ vertices', () => {
      const { startDrawing, addDrawingVertex, completeDrawing } =
        useProjectStore.getState()
      startDrawing('polygon', { x: 0, y: 0 })
      addDrawingVertex({ x: 100, y: 0 })
      addDrawingVertex({ x: 100, y: 100 })

      const vertices = completeDrawing()

      expect(vertices).toEqual([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ])

      // Drawing state should be reset
      const state = useProjectStore.getState()
      expect(state.drawingMode).toBeNull()
      expect(state.drawingVertices).toHaveLength(0)
      expect(state.drawingStartPoint).toBeNull()
    })

    it('should not complete polygon drawing with less than 3 vertices', () => {
      const { startDrawing, addDrawingVertex, completeDrawing } =
        useProjectStore.getState()
      startDrawing('polygon', { x: 0, y: 0 })
      addDrawingVertex({ x: 100, y: 0 })

      const vertices = completeDrawing()

      expect(vertices).toBeNull()
    })

    it('should complete rect drawing and convert to 4-vertex polygon', () => {
      const { startDrawing, updateDrawingPreview, completeDrawing } =
        useProjectStore.getState()
      startDrawing('rect', { x: 0, y: 0 })
      updateDrawingPreview({ x: 100, y: 50 })

      const vertices = completeDrawing()

      expect(vertices).toEqual([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
      ])
    })

    it('should cancel drawing', () => {
      const { startDrawing, addDrawingVertex, cancelDrawing } =
        useProjectStore.getState()
      startDrawing('polygon', { x: 0, y: 0 })
      addDrawingVertex({ x: 100, y: 0 })
      addDrawingVertex({ x: 100, y: 100 })

      cancelDrawing()

      const state = useProjectStore.getState()
      expect(state.drawingMode).toBeNull()
      expect(state.drawingVertices).toHaveLength(0)
      expect(state.drawingStartPoint).toBeNull()
    })

    it('should return null when completing without drawing mode', () => {
      const { completeDrawing } = useProjectStore.getState()

      const vertices = completeDrawing()

      expect(vertices).toBeNull()
    })

    it('should update drawing preview for rect mode', () => {
      const { startDrawing, updateDrawingPreview } = useProjectStore.getState()
      startDrawing('rect', { x: 10, y: 10 })

      updateDrawingPreview({ x: 200, y: 150 })

      const state = useProjectStore.getState()
      expect(state.drawingVertices).toEqual([
        { x: 10, y: 10 },
        { x: 200, y: 150 },
      ])
    })
  })
})
