import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import TopNav from './TopNav'
import MobileNav from './MobileNav'

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      {/* Desktop sidebar — fixed, 240px wide */}
      <Sidebar />

      {/* Main area shifted right on md+ to account for sidebar */}
      <div className="md:ml-60 flex flex-col min-h-screen">
        <TopNav />

        {/* Scrollable content */}
        <main
          className="flex-1 overflow-y-auto p-5 pb-20 md:pb-5"
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <MobileNav />
    </div>
  )
}
