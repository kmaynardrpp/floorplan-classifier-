import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useProjectStore } from '@/store/useProjectStore'

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    // Reset store with image loaded
    useProjectStore.setState({
      dataUrl: 'data:image/png;base64,test',
      filename: 'test.png',
      width: 100,
      height: 100,
      originalSize: 1000,
      zoom: 1.0,
      panX: 0,
      panY: 0,
      canvasWidth: 800,
      canvasHeight: 600,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const simulateKeyDown = (key: string, options: Partial<KeyboardEventInit> = {}) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    })
    window.dispatchEvent(event)
    return event
  }

  describe('zoom shortcuts', () => {
    it('should zoom in on + key', () => {
      renderHook(() => useKeyboardShortcuts())

      const initialZoom = useProjectStore.getState().zoom
      simulateKeyDown('+')

      expect(useProjectStore.getState().zoom).toBeGreaterThan(initialZoom)
    })

    it('should zoom in on = key', () => {
      renderHook(() => useKeyboardShortcuts())

      const initialZoom = useProjectStore.getState().zoom
      simulateKeyDown('=')

      expect(useProjectStore.getState().zoom).toBeGreaterThan(initialZoom)
    })

    it('should zoom out on - key', () => {
      renderHook(() => useKeyboardShortcuts())

      useProjectStore.setState({ zoom: 2.0 })
      const initialZoom = useProjectStore.getState().zoom
      simulateKeyDown('-')

      expect(useProjectStore.getState().zoom).toBeLessThan(initialZoom)
    })

    it('should reset zoom on 0 key', () => {
      renderHook(() => useKeyboardShortcuts())

      useProjectStore.setState({ zoom: 2.5 })
      simulateKeyDown('0')

      expect(useProjectStore.getState().zoom).toBe(1.0)
    })

    it('should not zoom when no image is loaded', () => {
      useProjectStore.setState({ dataUrl: null })
      renderHook(() => useKeyboardShortcuts())

      const initialZoom = useProjectStore.getState().zoom
      simulateKeyDown('+')

      expect(useProjectStore.getState().zoom).toBe(initialZoom)
    })

    it('should not zoom when ctrl is held (reserved for browser)', () => {
      renderHook(() => useKeyboardShortcuts())

      const initialZoom = useProjectStore.getState().zoom
      simulateKeyDown('+', { ctrlKey: true })

      expect(useProjectStore.getState().zoom).toBe(initialZoom)
    })
  })

  describe('input field handling', () => {
    it('should not handle shortcuts when typing in input', () => {
      renderHook(() => useKeyboardShortcuts())

      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()

      const initialZoom = useProjectStore.getState().zoom
      const event = new KeyboardEvent('keydown', {
        key: '+',
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'target', { value: input })
      window.dispatchEvent(event)

      expect(useProjectStore.getState().zoom).toBe(initialZoom)

      document.body.removeChild(input)
    })
  })

  describe('custom handlers', () => {
    it('should call custom onZoomIn handler', () => {
      const onZoomIn = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onZoomIn }))

      simulateKeyDown('+')

      expect(onZoomIn).toHaveBeenCalledTimes(1)
    })

    it('should call custom onZoomOut handler', () => {
      const onZoomOut = vi.fn()
      useProjectStore.setState({ zoom: 2.0 })
      renderHook(() => useKeyboardShortcuts({ onZoomOut }))

      simulateKeyDown('-')

      expect(onZoomOut).toHaveBeenCalledTimes(1)
    })

    it('should call custom onResetZoom handler', () => {
      const onResetZoom = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onResetZoom }))

      simulateKeyDown('0')

      expect(onResetZoom).toHaveBeenCalledTimes(1)
    })
  })

  describe('undo/redo shortcuts', () => {
    beforeEach(() => {
      // Reset history state and add some zones for history
      useProjectStore.setState({
        history: [],
        historyIndex: -1,
        zones: [],
        selectedZoneIds: [],
      })
    })

    it('should undo on Ctrl+Z when history is available', () => {
      // Setup: add a zone (creates history), then update it (creates another history entry)
      const { addZone, updateZone } = useProjectStore.getState()
      addZone({
        id: 'zone-1',
        name: 'Original',
        type: 'aisle',
        vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
        source: 'manual',
        confidence: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { color: '#000', opacity: 0.5, isVisible: true, isLocked: false, description: '', customProperties: {} },
      })
      updateZone('zone-1', { name: 'Updated' })

      renderHook(() => useKeyboardShortcuts())

      expect(useProjectStore.getState().zones[0]!.name).toBe('Updated')

      simulateKeyDown('z', { ctrlKey: true })

      expect(useProjectStore.getState().zones[0]!.name).toBe('Original')
    })

    it('should redo on Ctrl+Shift+Z after undo', () => {
      const { addZone, updateZone, undo } = useProjectStore.getState()
      addZone({
        id: 'zone-1',
        name: 'Original',
        type: 'aisle',
        vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
        source: 'manual',
        confidence: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { color: '#000', opacity: 0.5, isVisible: true, isLocked: false, description: '', customProperties: {} },
      })
      updateZone('zone-1', { name: 'Updated' })
      undo()

      renderHook(() => useKeyboardShortcuts())

      expect(useProjectStore.getState().zones[0]!.name).toBe('Original')

      simulateKeyDown('z', { ctrlKey: true, shiftKey: true })

      expect(useProjectStore.getState().zones[0]!.name).toBe('Updated')
    })

    it('should redo on Ctrl+Y after undo', () => {
      const { addZone, updateZone, undo } = useProjectStore.getState()
      addZone({
        id: 'zone-1',
        name: 'Original',
        type: 'aisle',
        vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
        source: 'manual',
        confidence: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { color: '#000', opacity: 0.5, isVisible: true, isLocked: false, description: '', customProperties: {} },
      })
      updateZone('zone-1', { name: 'Updated' })
      undo()

      renderHook(() => useKeyboardShortcuts())

      simulateKeyDown('y', { ctrlKey: true })

      expect(useProjectStore.getState().zones[0]!.name).toBe('Updated')
    })

    it('should call custom onUndo handler', () => {
      const onUndo = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onUndo }))

      simulateKeyDown('z', { ctrlKey: true })

      expect(onUndo).toHaveBeenCalledTimes(1)
    })

    it('should call custom onRedo handler', () => {
      const onRedo = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onRedo }))

      simulateKeyDown('z', { ctrlKey: true, shiftKey: true })

      expect(onRedo).toHaveBeenCalledTimes(1)
    })
  })

  describe('select all shortcut', () => {
    beforeEach(() => {
      useProjectStore.setState({
        zones: [
          {
            id: 'zone-1',
            name: 'Zone 1',
            type: 'aisle',
            vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
            source: 'manual',
        confidence: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: { color: '#000', opacity: 0.5, isVisible: true, isLocked: false, description: '', customProperties: {} },
          },
          {
            id: 'zone-2',
            name: 'Zone 2',
            type: 'parking_lot',
            vertices: [{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }],
            source: 'ai',
            confidence: 0.9,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: { color: '#000', opacity: 0.5, isVisible: true, isLocked: false, description: '', customProperties: {} },
          },
          {
            id: 'zone-3-locked',
            name: 'Zone 3 Locked',
            type: 'aisle',
            vertices: [{ x: 400, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 100 }],
            source: 'manual',
        confidence: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: { color: '#000', opacity: 0.5, isVisible: true, isLocked: true, description: '', customProperties: {} },
          },
          {
            id: 'zone-4-hidden',
            name: 'Zone 4 Hidden',
            type: 'aisle',
            vertices: [{ x: 600, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 100 }],
            source: 'manual',
        confidence: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: { color: '#000', opacity: 0.5, isVisible: false, isLocked: false, description: '', customProperties: {} },
          },
        ],
        selectedZoneIds: [],
      })
    })

    it('should select all visible unlocked zones on Ctrl+A', () => {
      renderHook(() => useKeyboardShortcuts())

      simulateKeyDown('a', { ctrlKey: true })

      const selectedIds = useProjectStore.getState().selectedZoneIds
      expect(selectedIds).toContain('zone-1')
      expect(selectedIds).toContain('zone-2')
      expect(selectedIds).not.toContain('zone-3-locked')
      expect(selectedIds).not.toContain('zone-4-hidden')
    })

    it('should call custom onSelectAll handler', () => {
      const onSelectAll = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSelectAll }))

      simulateKeyDown('a', { ctrlKey: true })

      expect(onSelectAll).toHaveBeenCalledTimes(1)
    })

    it('should not select all when no image is loaded', () => {
      useProjectStore.setState({ dataUrl: null })
      renderHook(() => useKeyboardShortcuts())

      simulateKeyDown('a', { ctrlKey: true })

      expect(useProjectStore.getState().selectedZoneIds).toHaveLength(0)
    })
  })

  describe('escape shortcut', () => {
    beforeEach(() => {
      useProjectStore.setState({
        selectedZoneIds: ['zone-1', 'zone-2'],
      })
    })

    it('should clear selection on Escape', () => {
      renderHook(() => useKeyboardShortcuts())

      expect(useProjectStore.getState().selectedZoneIds).toHaveLength(2)

      simulateKeyDown('Escape')

      expect(useProjectStore.getState().selectedZoneIds).toHaveLength(0)
    })

    it('should call custom onEscape handler', () => {
      const onEscape = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onEscape }))

      simulateKeyDown('Escape')

      expect(onEscape).toHaveBeenCalledTimes(1)
    })
  })

  describe('mode switching shortcuts', () => {
    it('should switch to select mode on V key', () => {
      useProjectStore.setState({ editorMode: 'pan' })
      renderHook(() => useKeyboardShortcuts())

      simulateKeyDown('v')

      expect(useProjectStore.getState().editorMode).toBe('select')
    })

    it('should switch to pan mode on H key', () => {
      renderHook(() => useKeyboardShortcuts())

      simulateKeyDown('h')

      expect(useProjectStore.getState().editorMode).toBe('pan')
    })

    it('should not switch modes when no image is loaded', () => {
      useProjectStore.setState({ dataUrl: null, editorMode: 'select' })
      renderHook(() => useKeyboardShortcuts())

      simulateKeyDown('h')

      expect(useProjectStore.getState().editorMode).toBe('select')
    })

    it('should not switch modes when Ctrl is held', () => {
      renderHook(() => useKeyboardShortcuts())

      simulateKeyDown('v', { ctrlKey: true })

      // Mode should not change because Ctrl is held
      expect(useProjectStore.getState().editorMode).toBe('select')
    })
  })

  describe('cleanup', () => {
    it('should remove event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
      const { unmount } = renderHook(() => useKeyboardShortcuts())

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      )

      removeEventListenerSpy.mockRestore()
    })
  })
})
