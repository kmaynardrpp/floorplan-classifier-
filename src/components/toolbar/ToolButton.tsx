import type { ReactNode } from 'react'

interface ToolButtonProps {
  icon: ReactNode
  label: string
  shortcut?: string
  isActive?: boolean
  disabled?: boolean
  onClick: () => void
}

export function ToolButton({
  icon,
  label,
  shortcut,
  isActive = false,
  disabled = false,
  onClick,
}: ToolButtonProps) {
  const title = shortcut ? `${label} (${shortcut})` : label

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
        isActive
          ? 'bg-primary text-white'
          : 'text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent'
      }`}
    >
      {icon}
    </button>
  )
}
