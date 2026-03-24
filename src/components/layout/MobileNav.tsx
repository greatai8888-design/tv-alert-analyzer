import { NavLink } from 'react-router-dom'

const navItems = [
  { label: '首頁', icon: 'insights', path: '/' },
  { label: '警報', icon: 'notifications', path: '/alerts' },
  { label: '追蹤', icon: 'monitoring', path: '/tracking' },
  { label: '收藏', icon: 'star', path: '/favorites' },
  { label: '教訓', icon: 'auto_stories', path: '/lessons' },
]

export default function MobileNav() {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around h-16 backdrop-blur-md rounded-t-2xl"
      style={{
        backgroundColor: 'rgba(242, 237, 228, 0.9)',
        borderTop: '1px solid #D9D2C7',
      }}
    >
      {navItems.map(({ label, icon, path }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className="flex flex-col items-center justify-center flex-1 h-full gap-1 min-h-[48px]"
        >
          {({ isActive }) => (
            <div
              className={[
                'flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-lg transition-colors',
                isActive ? 'bg-[#6B7A2E]' : '',
              ].join(' ')}
            >
              <span
                className="material-symbols-outlined text-[20px] leading-none"
                style={{ color: isActive ? '#FAF7F2' : '#4A4E52' }}
              >
                {icon}
              </span>
              <span
                className="mono-data text-[10px] uppercase tracking-wider font-medium"
                style={{ color: isActive ? '#FAF7F2' : '#4A4E52' }}
              >
                {label}
              </span>
            </div>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
