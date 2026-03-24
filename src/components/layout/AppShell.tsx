import { useState } from 'react'
import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import TopNav from './TopNav'
import MobileNav from './MobileNav'

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: '#FAF7F2' }}
    >
      {/* Desktop sidebar — fixed, 256px wide, visible on lg+ */}
      <Sidebar />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Sidebar panel */}
          <div className="relative z-10">
            <Sidebar mobile onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main area shifted right on lg+ to account for sidebar */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <TopNav onMenuClick={() => setSidebarOpen(true)} />

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-5 pb-20 lg:pb-5">
          {children}
        </main>
      </div>

      {/* Mobile bottom tabs — hidden on lg+ */}
      <MobileNav />
    </div>
  )
}
