import { useState, useCallback } from 'react'
import {
  useSettingsStore,
  isValidApiKeyFormat,
  maskApiKey,
  getProviderName,
  getApiKeyPlaceholder,
  getProviderConsoleUrl,
  type ApiProvider,
} from '@/store/useSettingsStore'

interface ApiKeyModalProps {
  isOpen: boolean
  onClose: () => void
}

const PROVIDERS: ApiProvider[] = ['anthropic', 'openai', 'gemini']

export function ApiKeyModal({ isOpen, onClose }: ApiKeyModalProps) {
  const {
    apiProvider,
    anthropicApiKey,
    openaiApiKey,
    geminiApiKey,
    useCompression,
    useIntensiveTravelLaneDetection,
    useLatestGeminiModel,
    setApiProvider,
    setProviderApiKey,
    clearProviderApiKey,
    setUseCompression,
    setUseIntensiveTravelLaneDetection,
    setUseLatestGeminiModel,
  } = useSettingsStore()

  const [inputValues, setInputValues] = useState<Record<ApiProvider, string>>({
    anthropic: '',
    openai: '',
    gemini: '',
  })
  const [errors, setErrors] = useState<Record<ApiProvider, string | null>>({
    anthropic: null,
    openai: null,
    gemini: null,
  })
  const [showKeys, setShowKeys] = useState<Record<ApiProvider, boolean>>({
    anthropic: false,
    openai: false,
    gemini: false,
  })

  // Get the current key for a provider
  const getKeyForProvider = (provider: ApiProvider): string | null => {
    switch (provider) {
      case 'anthropic':
        return anthropicApiKey
      case 'openai':
        return openaiApiKey
      case 'gemini':
        return geminiApiKey
      default:
        return null
    }
  }

  const handleSave = useCallback(
    (provider: ApiProvider) => {
      const trimmedKey = inputValues[provider].trim()

      if (!trimmedKey) {
        setErrors((prev) => ({
          ...prev,
          [provider]: 'Please enter an API key',
        }))
        return
      }

      if (!isValidApiKeyFormat(trimmedKey, provider)) {
        const errorMsg =
          provider === 'anthropic'
            ? 'Invalid API key format. Keys should start with "sk-ant-"'
            : provider === 'openai'
              ? 'Invalid API key format. Keys should start with "sk-"'
              : 'Invalid API key format'
        setErrors((prev) => ({ ...prev, [provider]: errorMsg }))
        return
      }

      setProviderApiKey(provider, trimmedKey)
      setInputValues((prev) => ({ ...prev, [provider]: '' }))
      setErrors((prev) => ({ ...prev, [provider]: null }))
    },
    [inputValues, setProviderApiKey]
  )

  const handleClear = useCallback(
    (provider: ApiProvider) => {
      clearProviderApiKey(provider)
      setInputValues((prev) => ({ ...prev, [provider]: '' }))
      setErrors((prev) => ({ ...prev, [provider]: null }))
    },
    [clearProviderApiKey]
  )

  const handleClose = useCallback(() => {
    setInputValues({ anthropic: '', openai: '', gemini: '' })
    setErrors({ anthropic: null, openai: null, gemini: null })
    onClose()
  }, [onClose])

  const toggleShowKey = (provider: ApiProvider) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            AI Provider Settings
          </h2>
          <button
            onClick={handleClose}
            className="rounded p-1 text-text-secondary hover:bg-surface-secondary"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Provider Selection */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-text-primary">
            Active AI Provider
          </label>
          <div className="grid grid-cols-3 gap-2">
            {PROVIDERS.map((provider) => {
              const isActive = apiProvider === provider
              const hasKey = getKeyForProvider(provider) !== null
              return (
                <button
                  key={provider}
                  onClick={() => setApiProvider(provider)}
                  className={`relative rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-secondary hover:border-primary/50 hover:bg-surface-secondary'
                  }`}
                >
                  {getProviderName(provider).split(' ')[0]}
                  {hasKey && (
                    <span
                      className={`absolute -right-1 -top-1 h-3 w-3 rounded-full ${
                        isActive ? 'bg-primary' : 'bg-success'
                      }`}
                      title="API Key configured"
                    />
                  )}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-text-secondary">
            Select which AI provider to use for zone detection
          </p>
        </div>

        {/* Compression Toggle */}
        <div className="mb-6 rounded-lg border border-border bg-surface-secondary p-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-text-primary">
                Image Compression
              </label>
              <p className="text-xs text-text-secondary">
                {apiProvider === 'anthropic'
                  ? 'Required for Anthropic (5MB limit)'
                  : 'Disable for better quality with OpenAI/Gemini'}
              </p>
            </div>
            <button
              onClick={() => setUseCompression(!useCompression)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                useCompression ? 'bg-primary' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  useCompression ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {!useCompression && apiProvider === 'anthropic' && (
            <p className="mt-2 text-xs text-warning">
              Warning: Disabling compression may cause errors with large images on Anthropic
            </p>
          )}
        </div>

        {/* Gemini Model Toggle */}
        {apiProvider === 'gemini' && (
          <div className="mb-6 rounded-lg border border-border bg-surface-secondary p-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-text-primary">
                  Use Latest Gemini Model
                </label>
                <p className="text-xs text-text-secondary">
                  {useLatestGeminiModel ? 'gemini-3-pro-preview' : 'gemini-2.5-pro (stable)'}
                </p>
              </div>
              <button
                onClick={() => setUseLatestGeminiModel(!useLatestGeminiModel)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  useLatestGeminiModel ? 'bg-purple-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    useLatestGeminiModel ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {useLatestGeminiModel && (
              <p className="mt-2 text-xs text-purple-600">
                Using preview model: gemini-3-pro-preview (may have different behavior)
              </p>
            )}
          </div>
        )}

        {/* Intensive Travel Lane Detection Toggle */}
        <div className="mb-6 rounded-lg border border-border bg-surface-secondary p-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-text-primary">
                Intensive Travel Lane Detection
              </label>
              <p className="text-xs text-text-secondary">
                Deep analysis of orange/gray boundaries with contiguity verification
              </p>
            </div>
            <button
              onClick={() => setUseIntensiveTravelLaneDetection(!useIntensiveTravelLaneDetection)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                useIntensiveTravelLaneDetection ? 'bg-orange-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  useIntensiveTravelLaneDetection ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {useIntensiveTravelLaneDetection && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-orange-600">
                <strong>Intensive mode enabled:</strong> AI will focus ONLY on travel lanes with high-precision boundary tracing.
              </p>
              <p className="text-xs text-text-secondary">
                Uses 20-50+ vertices per lane for accurate orange/gray line tracing. Verifies network contiguity.
              </p>
            </div>
          )}
          {!useIntensiveTravelLaneDetection && (
            <p className="mt-2 text-xs text-text-secondary">
              Standard mode: Detects all zone types (travel lanes, racking, docking, etc.)
            </p>
          )}
        </div>

        {/* API Keys Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-text-primary border-b border-border pb-2">
            API Keys
          </h3>

          {PROVIDERS.map((provider) => {
            const currentKey = getKeyForProvider(provider)
            const hasKey = currentKey !== null
            const isActive = apiProvider === provider

            return (
              <div
                key={provider}
                className={`rounded-lg border p-4 ${
                  isActive ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {getProviderName(provider)}
                    </span>
                    {isActive && (
                      <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                        Active
                      </span>
                    )}
                  </div>
                  {hasKey && (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="h-3 w-3"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                      Configured
                    </span>
                  )}
                </div>

                {hasKey && currentKey && (
                  <div className="mb-3 flex items-center justify-between rounded bg-surface-secondary px-3 py-2">
                    <span className="font-mono text-sm text-text-secondary">
                      {showKeys[provider] ? currentKey : maskApiKey(currentKey)}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleShowKey(provider)}
                        className="rounded p-1 text-text-secondary hover:bg-surface hover:text-text-primary"
                        title={showKeys[provider] ? 'Hide key' : 'Show key'}
                      >
                        {showKeys[provider] ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="h-4 w-4"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                            />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="h-4 w-4"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKeys[provider] ? 'text' : 'password'}
                      value={inputValues[provider]}
                      onChange={(e) => {
                        setInputValues((prev) => ({
                          ...prev,
                          [provider]: e.target.value,
                        }))
                        setErrors((prev) => ({ ...prev, [provider]: null }))
                      }}
                      placeholder={getApiKeyPlaceholder(provider)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <button
                    onClick={() => handleSave(provider)}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
                  >
                    {hasKey ? 'Update' : 'Save'}
                  </button>
                  {hasKey && (
                    <button
                      onClick={() => handleClear(provider)}
                      className="rounded-lg border border-error px-3 py-2 text-sm font-medium text-error hover:bg-error/10"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {errors[provider] && (
                  <p className="mt-2 text-sm text-error">{errors[provider]}</p>
                )}

                <p className="mt-2 text-xs text-text-secondary">
                  Get your API key from the{' '}
                  <a
                    href={getProviderConsoleUrl(provider)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {provider === 'anthropic'
                      ? 'Anthropic Console'
                      : provider === 'openai'
                        ? 'OpenAI Platform'
                        : 'Google AI Studio'}
                  </a>
                </p>
              </div>
            )
          })}
        </div>

        {/* Close Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
