import { describe, it, expect, beforeEach } from 'vitest'
import {
  useSettingsStore,
  isValidApiKeyFormat,
  maskApiKey,
} from './useSettingsStore'

describe('useSettingsStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useSettingsStore.setState({
      apiKey: null,
      apiKeySet: false,
    })
  })

  describe('setApiKey', () => {
    it('should set the API key', () => {
      const { setApiKey } = useSettingsStore.getState()

      setApiKey('sk-ant-test-key-12345678901234567890')

      const state = useSettingsStore.getState()
      expect(state.apiKey).toBe('sk-ant-test-key-12345678901234567890')
      expect(state.apiKeySet).toBe(true)
    })

    it('should trim whitespace from API key', () => {
      const { setApiKey } = useSettingsStore.getState()

      setApiKey('  sk-ant-test-key-12345678901234567890  ')

      expect(useSettingsStore.getState().apiKey).toBe(
        'sk-ant-test-key-12345678901234567890'
      )
    })

    it('should not set apiKeySet for empty string', () => {
      const { setApiKey } = useSettingsStore.getState()

      setApiKey('   ')

      expect(useSettingsStore.getState().apiKeySet).toBe(false)
    })
  })

  describe('clearApiKey', () => {
    it('should clear the API key', () => {
      const { setApiKey, clearApiKey } = useSettingsStore.getState()

      setApiKey('sk-ant-test-key-12345678901234567890')
      clearApiKey()

      const state = useSettingsStore.getState()
      expect(state.apiKey).toBeNull()
      expect(state.apiKeySet).toBe(false)
    })
  })
})

describe('isValidApiKeyFormat', () => {
  it('should return true for valid API key format', () => {
    expect(isValidApiKeyFormat('sk-ant-test-key-12345678901234567890')).toBe(
      true
    )
    expect(isValidApiKeyFormat('sk-ant-api03-abc123def456xyz')).toBe(true)
  })

  it('should return false for invalid API key format', () => {
    expect(isValidApiKeyFormat('invalid-key')).toBe(false)
    expect(isValidApiKeyFormat('sk-wrong-prefix')).toBe(false)
    expect(isValidApiKeyFormat('')).toBe(false)
    expect(isValidApiKeyFormat('sk-ant-')).toBe(false) // Too short
  })
})

describe('maskApiKey', () => {
  it('should mask API key showing first 8 and last 4 characters', () => {
    const key = 'sk-ant-api03-abcdefghijklmnop'
    expect(maskApiKey(key)).toBe('sk-ant-a...mnop')
  })

  it('should handle short keys', () => {
    expect(maskApiKey('short')).toBe('****')
    expect(maskApiKey('123456789012')).toBe('****')
  })

  it('should handle longer keys', () => {
    const longKey = 'sk-ant-very-long-api-key-with-many-characters'
    expect(maskApiKey(longKey)).toBe('sk-ant-v...ters')
  })
})
