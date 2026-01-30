import { type ReactNode } from 'react'

interface MainLayoutProps {
  leftPanel?: ReactNode
  rightPanel?: ReactNode
  children: ReactNode
}

export function MainLayout({ leftPanel, rightPanel, children }: MainLayoutProps) {
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left Sidebar - Zone Panel */}
      {leftPanel && (
        <aside className="w-[280px] flex-shrink-0 border-r border-gray-200 bg-white">
          {leftPanel}
        </aside>
      )}

      {/* Main Canvas Area */}
      <main className="flex flex-1 flex-col overflow-hidden bg-gray-100">
        {children}
      </main>

      {/* Right Sidebar - Properties Panel */}
      {rightPanel && (
        <aside className="w-[300px] flex-shrink-0 border-l border-gray-200 bg-white">
          {rightPanel}
        </aside>
      )}
    </div>
  )
}
