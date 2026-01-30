# Undo/Redo System Design

## Overview

This document describes the undo/redo system architecture for the Floorplan Zone Editor.

## Approach: Snapshot-Based

We use a **snapshot-based** approach where each history entry stores a complete copy of the zone state. This approach was chosen because:

1. **Simplicity**: Works naturally with Immer's immutable updates
2. **Reliability**: Each state is self-contained, no command reconstruction needed
3. **Performance**: Zone data is relatively small (typically <100 zones)

## History Structure

```typescript
interface HistoryEntry {
  zones: Zone[]
  timestamp: number
}

interface HistoryState {
  entries: HistoryEntry[]
  currentIndex: number
  maxEntries: number // default 50
}
```

## Recordable vs Non-Recordable Actions

### Recordable Actions (create history entry)

These actions mutate zone data and should be undoable:

- `addZone` - Add a single zone
- `addZones` - Add multiple zones (e.g., from AI analysis)
- `updateZone` - Modify zone properties
- `removeZone` - Delete a single zone
- `removeZones` - Delete multiple zones
- `clearZones` - Clear all zones
- `setZonesFromAnalysis` - Replace zones from AI analysis
- `updateVertex` - Move a vertex
- `addVertex` - Add a vertex to a polygon
- `removeVertex` - Remove a vertex from a polygon
- `duplicateZone` - Duplicate a zone
- `translateZone` / `translateZones` - Move zone(s)
- `reorderZones` - Change zone rendering order

### Non-Recordable Actions

These actions don't create history entries:

- Selection changes (`selectZone`, `clearSelection`, etc.)
- Viewport changes (`setZoom`, `setPan`, etc.)
- UI state changes (panel collapse, filters, search)
- Editor mode changes (`setMode`)
- Drawing state (until drawing is completed)
- Hover state changes

## History Management

### Push History

Before any recordable action, we snapshot the current zones:

```typescript
pushHistory: () => {
  set((state) => {
    // Truncate forward history if we're not at the end
    const newEntries = state.history.entries.slice(0, state.history.currentIndex + 1)

    // Add current state as new entry
    newEntries.push({
      zones: JSON.parse(JSON.stringify(state.zones)), // deep copy
      timestamp: Date.now()
    })

    // Enforce max entries limit
    if (newEntries.length > state.history.maxEntries) {
      newEntries.shift()
    }

    state.history.entries = newEntries
    state.history.currentIndex = newEntries.length - 1
  })
}
```

### Undo

```typescript
undo: () => {
  set((state) => {
    if (state.history.currentIndex > 0) {
      state.history.currentIndex--
      state.zones = JSON.parse(JSON.stringify(
        state.history.entries[state.history.currentIndex].zones
      ))
      // Clear selection since undone zones may not exist
      state.selectedZoneIds = []
      state.hoveredZoneId = null
    }
  })
}
```

### Redo

```typescript
redo: () => {
  set((state) => {
    if (state.history.currentIndex < state.history.entries.length - 1) {
      state.history.currentIndex++
      state.zones = JSON.parse(JSON.stringify(
        state.history.entries[state.history.currentIndex].zones
      ))
      // Clear selection
      state.selectedZoneIds = []
      state.hoveredZoneId = null
    }
  })
}
```

## Implementation Strategy

### Option 1: Manual Recording (Chosen)

Each recordable action explicitly calls `pushHistory()` before making changes:

```typescript
addZone: (zone: Zone) => {
  set((state) => {
    // Push history first
    pushHistoryImpl(state)
    // Then make the change
    state.zones.push(zone)
  })
}
```

### Option 2: Middleware (Alternative)

Wrap recordable actions in a middleware that automatically records history. Not chosen due to complexity with Immer.

## Computed Selectors

```typescript
const canUndo = (state) => state.history.currentIndex > 0
const canRedo = (state) => state.history.currentIndex < state.history.entries.length - 1
```

## Keyboard Shortcuts

- `Ctrl+Z` / `Cmd+Z` - Undo
- `Ctrl+Shift+Z` / `Cmd+Shift+Z` - Redo
- `Ctrl+Y` / `Cmd+Y` - Redo (alternative)

## Edge Cases

1. **Empty history**: Undo is disabled when `currentIndex === 0`
2. **End of history**: Redo is disabled when at the last entry
3. **New action after undo**: Forward history is discarded
4. **Max entries reached**: Oldest entry is removed
5. **Selection on undo**: Selection is cleared (undone zones may have different IDs)

## Memory Considerations

With 50 max entries and ~100 zones per entry, each zone ~1KB:
- Estimated max memory: 50 * 100 * 1KB = 5MB
- This is acceptable for modern browsers

For very large zone counts (500+), consider:
- Reducing max entries
- Using structural sharing (more complex)
- Storing diffs instead of snapshots (more complex)

## Testing Strategy

1. Unit tests for `pushHistory`, `undo`, `redo` actions
2. Test `canUndo` / `canRedo` computed values
3. Test history truncation on new action after undo
4. Test max entries enforcement
5. Integration test: make changes → undo → redo → verify state
