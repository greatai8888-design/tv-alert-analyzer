import { Bell, Search } from 'lucide-react'

export default function TopNav() {
  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between px-5 h-14 shrink-0"
      style={{
        backgroundColor: 'var(--color-bg-primary)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* Left: page title placeholder */}
      <div />

      {/* Right: search + bell */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-1.5"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
        >
          <Search size={15} color="var(--color-text-secondary)" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent text-sm outline-none w-40"
            style={{ color: 'var(--color-text-primary)' }}
          />
        </div>

        <button
          className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <Bell size={18} />
        </button>
      </div>
    </header>
  )
}
