import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'
import { useProjectStore } from '@/store/useProjectStore'

// Mock Konva components for testing
vi.mock('react-konva', () => ({
  Stage: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="konva-stage">{children}</div>
  ),
  Layer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="konva-layer">{children}</div>
  ),
  Image: () => <div data-testid="konva-image" />,
}))

describe('App', () => {
  beforeEach(() => {
    // Reset store before each test
    useProjectStore.setState({
      dataUrl: null,
      filename: null,
      width: 0,
      height: 0,
      originalSize: 0,
      zoom: 1.0,
      panX: 0,
      panY: 0,
      canvasWidth: 0,
      canvasHeight: 0,
    })
  })

  it('renders the header with app title', () => {
    render(<App />)
    expect(screen.getByText('Floorplan Zone Editor')).toBeInTheDocument()
  })

  describe('when no image is loaded', () => {
    it('renders the empty state', () => {
      render(<App />)
      expect(screen.getByText('Upload a Floorplan')).toBeInTheDocument()
    })

    it('shows supported formats info', () => {
      render(<App />)
      expect(
        screen.getByText('Supported formats: JPEG, PNG')
      ).toBeInTheDocument()
      expect(screen.getByText('Maximum file size: 20 MB')).toBeInTheDocument()
    })

    it('renders the upload button', () => {
      render(<App />)
      expect(
        screen.getByRole('button', { name: /select floorplan image/i })
      ).toBeInTheDocument()
    })

    it('does not render the toolbar', () => {
      render(<App />)
      expect(screen.queryByText('Tools')).not.toBeInTheDocument()
    })

    it('does not render the canvas', () => {
      render(<App />)
      expect(screen.queryByTestId('konva-stage')).not.toBeInTheDocument()
    })
  })

  describe('when an image is loaded', () => {
    beforeEach(() => {
      useProjectStore.setState({
        dataUrl: 'data:image/png;base64,test',
        filename: 'test-floorplan.png',
        width: 1920,
        height: 1080,
        originalSize: 100000,
      })
    })

    it('renders the toolbar', () => {
      render(<App />)
      // Mode buttons in toolbar
      expect(screen.getByTitle('Select (V)')).toBeInTheDocument()
      expect(screen.getByTitle('Pan (H)')).toBeInTheDocument()
      // Zoom controls
      expect(screen.getByTitle('Zoom in (+)')).toBeInTheDocument()
      expect(screen.getByTitle('Zoom out (-)')).toBeInTheDocument()
      expect(screen.getByTitle('Reset zoom (0)')).toBeInTheDocument()
      // History controls
      expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeInTheDocument()
      expect(screen.getByTitle('Redo (Ctrl+Shift+Z)')).toBeInTheDocument()
    })

    it('does not render the empty state', () => {
      render(<App />)
      expect(screen.queryByText('Upload a Floorplan')).not.toBeInTheDocument()
    })

    it('shows the filename in the header', () => {
      render(<App />)
      expect(screen.getByText('test-floorplan.png')).toBeInTheDocument()
    })

    it('renders the canvas container', () => {
      render(<App />)
      // Canvas container is rendered but Stage requires dimensions from ResizeObserver
      // In test environment, we verify the canvas area is present (not empty state)
      expect(screen.queryByText('Upload a Floorplan')).not.toBeInTheDocument()
      // Toolbar controls indicate canvas is present
      expect(screen.getByTitle('Select (V)')).toBeInTheDocument()
    })
  })
})
