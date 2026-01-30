import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Supported AI providers for zone detection
 */
export type ApiProvider = 'anthropic' | 'openai' | 'gemini'

interface SettingsState {
  // Current provider selection
  apiProvider: ApiProvider

  // Provider-specific API keys
  anthropicApiKey: string | null
  openaiApiKey: string | null
  geminiApiKey: string | null

  // Legacy fields (for backward compatibility)
  apiKey: string | null
  apiKeySet: boolean

  // Image compression settings per provider
  // Anthropic requires compression, OpenAI/Gemini work better uncompressed
  useCompression: boolean

  // Aisle detection mode
  // When true, aisles are 100% programmatic from TDOA data (no AI sub-agents)
  // When false, AI sub-agents analyze racking areas for aisle detection
  useProgrammaticAislesOnly: boolean

  // Intensive travel lane detection mode
  // When true, uses specialized AI prompt for precise orange/gray boundary tracing with contiguity verification
  // When false, uses standard coarse detection (travel lanes + racking + docking + etc)
  useIntensiveTravelLaneDetection: boolean

  // Use latest Gemini model (preview)
  // When true, uses gemini-3-pro-preview
  // When false, uses gemini-2.5-pro (stable)
  useLatestGeminiModel: boolean
}

interface SettingsActions {
  setApiProvider: (provider: ApiProvider) => void
  setProviderApiKey: (provider: ApiProvider, key: string) => void
  clearProviderApiKey: (provider: ApiProvider) => void
  setUseCompression: (useCompression: boolean) => void
  setUseProgrammaticAislesOnly: (useProgrammaticAislesOnly: boolean) => void
  setUseIntensiveTravelLaneDetection: (
    useIntensiveTravelLaneDetection: boolean
  ) => void
  setUseLatestGeminiModel: (useLatestGeminiModel: boolean) => void

  // Legacy methods (redirects to current provider)
  setApiKey: (key: string) => void
  clearApiKey: () => void
}

interface SettingsStore extends SettingsState, SettingsActions {}

const STORAGE_KEY = 'floorplan-settings'

/**
 * Get default compression setting for a provider
 * Anthropic requires compression due to 5MB limit
 * OpenAI and Gemini work better with uncompressed images
 */
function getDefaultCompression(provider: ApiProvider): boolean {
  return provider === 'anthropic'
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      apiProvider: 'anthropic',

      anthropicApiKey: null,
      openaiApiKey: null,
      geminiApiKey: null,

      // Legacy fields - derived from current provider
      apiKey: null,
      apiKeySet: false,

      useCompression: true, // Default to compressed for Anthropic
      useProgrammaticAislesOnly: true, // Default: aisles from TDOA data only (no AI sub-agents)
      useIntensiveTravelLaneDetection: false, // Default: use standard coarse detection
      useLatestGeminiModel: false, // Default: use stable gemini-2.5-pro

      setApiProvider: (provider: ApiProvider) => {
        const state = get()
        const keyForProvider =
          provider === 'anthropic'
            ? state.anthropicApiKey
            : provider === 'openai'
              ? state.openaiApiKey
              : state.geminiApiKey

        set({
          apiProvider: provider,
          apiKey: keyForProvider,
          apiKeySet: keyForProvider !== null && keyForProvider.length > 0,
          useCompression: getDefaultCompression(provider),
        })
      },

      setProviderApiKey: (provider: ApiProvider, key: string) => {
        const trimmedKey = key.trim()
        const state = get()

        const updates: Partial<SettingsState> = {}

        if (provider === 'anthropic') {
          updates.anthropicApiKey = trimmedKey || null
        } else if (provider === 'openai') {
          updates.openaiApiKey = trimmedKey || null
        } else if (provider === 'gemini') {
          updates.geminiApiKey = trimmedKey || null
        }

        // Update legacy fields if this is the current provider
        if (provider === state.apiProvider) {
          updates.apiKey = trimmedKey || null
          updates.apiKeySet = trimmedKey.length > 0
        }

        set(updates)
      },

      clearProviderApiKey: (provider: ApiProvider) => {
        const state = get()

        const updates: Partial<SettingsState> = {}

        if (provider === 'anthropic') {
          updates.anthropicApiKey = null
        } else if (provider === 'openai') {
          updates.openaiApiKey = null
        } else if (provider === 'gemini') {
          updates.geminiApiKey = null
        }

        // Update legacy fields if this is the current provider
        if (provider === state.apiProvider) {
          updates.apiKey = null
          updates.apiKeySet = false
        }

        set(updates)
      },

      setUseCompression: (useCompression: boolean) => {
        set({ useCompression })
      },

      setUseProgrammaticAislesOnly: (useProgrammaticAislesOnly: boolean) => {
        set({ useProgrammaticAislesOnly })
      },

      setUseIntensiveTravelLaneDetection: (
        useIntensiveTravelLaneDetection: boolean
      ) => {
        set({ useIntensiveTravelLaneDetection })
      },

      setUseLatestGeminiModel: (useLatestGeminiModel: boolean) => {
        set({ useLatestGeminiModel })
      },

      // Legacy method - sets key for current provider
      setApiKey: (key: string) => {
        const provider = get().apiProvider
        get().setProviderApiKey(provider, key)
      },

      clearApiKey: () => {
        const provider = get().apiProvider
        get().clearProviderApiKey(provider)
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        apiProvider: state.apiProvider,
        anthropicApiKey: state.anthropicApiKey,
        openaiApiKey: state.openaiApiKey,
        geminiApiKey: state.geminiApiKey,
        apiKey: state.apiKey,
        apiKeySet: state.apiKeySet,
        useCompression: state.useCompression,
        useProgrammaticAislesOnly: state.useProgrammaticAislesOnly,
        useIntensiveTravelLaneDetection: state.useIntensiveTravelLaneDetection,
        useLatestGeminiModel: state.useLatestGeminiModel,
      }),
    }
  )
)

/**
 * Validate API key format for a specific provider
 * - Claude API keys start with "sk-ant-"
 * - OpenAI API keys start with "sk-"
 * - Gemini API keys start with "AI"
 */
export function isValidApiKeyFormat(
  key: string,
  provider?: ApiProvider
): boolean {
  const trimmed = key.trim()
  if (trimmed.length < 10) return false

  if (!provider) {
    // Legacy check - default to Claude format
    return trimmed.startsWith('sk-ant-') && trimmed.length > 20
  }

  switch (provider) {
    case 'anthropic':
      return trimmed.startsWith('sk-ant-') && trimmed.length > 20
    case 'openai':
      // OpenAI keys can be sk- (legacy) or sk-proj- (project keys)
      return (
        (trimmed.startsWith('sk-') || trimmed.startsWith('sk-proj-')) &&
        trimmed.length > 20
      )
    case 'gemini':
      // Gemini keys typically start with "AI" and are alphanumeric
      return trimmed.length > 20
    default:
      return false
  }
}

/**
 * Get provider display name
 */
export function getProviderName(provider: ApiProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'Claude (Anthropic)'
    case 'openai':
      return 'OpenAI'
    case 'gemini':
      return 'Gemini (Google)'
    default:
      return provider
  }
}

/**
 * Get API key placeholder for a provider
 */
export function getApiKeyPlaceholder(provider: ApiProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'sk-ant-...'
    case 'openai':
      return 'sk-...'
    case 'gemini':
      return 'AI...'
    default:
      return 'Enter API key...'
  }
}

/**
 * Get console URL for a provider
 */
export function getProviderConsoleUrl(provider: ApiProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'https://console.anthropic.com/settings/keys'
    case 'openai':
      return 'https://platform.openai.com/api-keys'
    case 'gemini':
      return 'https://aistudio.google.com/app/apikey'
    default:
      return '#'
  }
}

/**
 * Mask API key for display (show first 8 chars and last 4)
 */
export function maskApiKey(key: string): string {
  if (key.length <= 12) return '****'
  return `${key.slice(0, 8)}...${key.slice(-4)}`
}
