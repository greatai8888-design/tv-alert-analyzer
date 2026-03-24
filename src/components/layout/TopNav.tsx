export default function TopNav() {
  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between px-5 h-14 shrink-0 backdrop-blur-md"
      style={{
        backgroundColor: 'rgba(250, 247, 242, 0.9)',
        borderBottom: '1px solid #D9D2C7',
      }}
    >
      {/* Left: hamburger + logo */}
      <div className="flex items-center gap-3">
        <button
          className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-[#D9D2C7]/40 lg:hidden"
          style={{ color: '#4A4E52' }}
          aria-label="Open menu"
        >
          <span className="material-symbols-outlined text-[22px] leading-none">
            menu
          </span>
        </button>
        <span
          className="serif-heading italic text-xl"
          style={{ color: '#6B7A2E' }}
        >
          Stitch
        </span>
      </div>

      {/* Right: search + notifications + avatar */}
      <div className="flex items-center gap-2">
        <button
          className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-[#D9D2C7]/40"
          style={{ color: '#4A4E52' }}
          aria-label="Search"
        >
          <span className="material-symbols-outlined text-[20px] leading-none">
            search
          </span>
        </button>

        <button
          className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-[#D9D2C7]/40"
          style={{ color: '#4A4E52' }}
          aria-label="Notifications"
        >
          <span className="material-symbols-outlined text-[20px] leading-none">
            notifications
          </span>
        </button>

        {/* User avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ml-1"
          style={{ backgroundColor: '#6B7A2E', color: '#FAF7F2' }}
        >
          U
        </div>
      </div>
    </header>
  )
}
