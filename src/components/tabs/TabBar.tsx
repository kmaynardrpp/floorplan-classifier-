/**
 * Tab navigation bar component
 */

import React, { useCallback } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import type { TabType } from '@/types/store'

interface TabConfig {
  id: TabType
  label: string
  icon?: React.ReactNode
}

const TABS: TabConfig[] = [
  {
    id: 'pre-ai',
    label: 'Pre-AI Zones',
    icon: (
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
          d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
        />
      </svg>
    ),
  },
  {
    id: 'post-ai',
    label: 'Post-AI Zones',
    icon: (
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
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
        />
      </svg>
    ),
  },
  {
    id: 'route',
    label: 'Shortest Route',
    icon: (
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
          d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
        />
      </svg>
    ),
  },
]

interface TabButtonProps {
  tab: TabConfig
  isActive: boolean
  onClick: () => void
  tabIndex: number
  onKeyDown: (e: React.KeyboardEvent, tabIndex: number) => void
}

function TabButton({
  tab,
  isActive,
  onClick,
  tabIndex,
  onKeyDown,
}: TabButtonProps) {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-controls={`tabpanel-${tab.id}`}
      tabIndex={isActive ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => onKeyDown(e, tabIndex)}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {tab.icon}
      <span className="hidden sm:inline">{tab.label}</span>
    </button>
  )
}

export function TabBar() {
  const activeTab = useProjectStore((s) => s.activeTab)
  const setActiveTab = useProjectStore((s) => s.setActiveTab)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      let newIndex = currentIndex

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          newIndex = currentIndex > 0 ? currentIndex - 1 : TABS.length - 1
          break
        case 'ArrowRight':
          e.preventDefault()
          newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : 0
          break
        case 'Home':
          e.preventDefault()
          newIndex = 0
          break
        case 'End':
          e.preventDefault()
          newIndex = TABS.length - 1
          break
        default:
          return
      }

      const newTab = TABS[newIndex]
      if (newTab) {
        setActiveTab(newTab.id)
        // Focus the new tab button
        const buttons = document.querySelectorAll('[role="tab"]')
        const button = buttons[newIndex] as HTMLButtonElement | undefined
        button?.focus()
      }
    },
    [setActiveTab]
  )

  return (
    <div
      role="tablist"
      aria-label="Zone view tabs"
      className="flex gap-1 p-1 bg-gray-100 rounded-lg"
    >
      {TABS.map((tab, index) => (
        <TabButton
          key={tab.id}
          tab={tab}
          isActive={activeTab === tab.id}
          onClick={() => setActiveTab(tab.id)}
          tabIndex={index}
          onKeyDown={handleKeyDown}
        />
      ))}
    </div>
  )
}
