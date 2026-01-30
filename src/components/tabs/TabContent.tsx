/**
 * Container that renders correct tab content based on active tab
 */

import { useProjectStore } from '@/store/useProjectStore'
import { PreAIZonesTab } from './PreAIZonesTab'
import { PostAIZonesTab } from './PostAIZonesTab'
import { ShortestRouteTab } from './ShortestRouteTab'

export function TabContent() {
  const activeTab = useProjectStore((s) => s.activeTab)

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${activeTab}`}
      aria-labelledby={`tab-${activeTab}`}
      className="flex-1 overflow-y-auto"
    >
      {activeTab === 'pre-ai' && <PreAIZonesTab />}
      {activeTab === 'post-ai' && <PostAIZonesTab />}
      {activeTab === 'route' && <ShortestRouteTab />}
    </div>
  )
}
