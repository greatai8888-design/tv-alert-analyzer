import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const navItems = [
  { label: 'Dashboard', icon: 'insights', path: '/' },
  { label: 'Alerts', icon: 'notifications', path: '/alerts' },
  { label: 'Tracking', icon: 'monitoring', path: '/tracking' },
  { label: 'Favorites', icon: 'star', path: '/favorites' },
  { label: 'Lessons', icon: 'auto_stories', path: '/lessons' },
  { label: 'Settings', icon: 'settings', path: '/settings' },
]

interface SidebarProps {
  mobile?: boolean
  onClose?: () => void
}

export default function Sidebar({ mobile, onClose }: SidebarProps) {
  const { signOut } = useAuth()

  return (
    <aside
      className={[
        'flex flex-col h-screen w-64 shrink-0',
        mobile ? 'relative' : 'hidden lg:flex fixed left-0 top-0 z-20',
      ].join(' ')}
      style={{
        backgroundColor: '#F2EDE4',
        borderRight: '1px solid #D9D2C7',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: '1px solid #D9D2C7' }}
      >
        <span
          className="serif-heading italic text-xl"
          style={{ color: '#6B7A2E' }}
        >
          Stitch
        </span>
        {mobile && onClose && (
          <button
            onClick={onClose}
            className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[#D9D2C7]/40 transition-colors"
            style={{ color: '#4A4E52' }}
            aria-label="Close menu"
          >
            <span className="material-symbols-outlined text-[20px] leading-none">close</span>
          </button>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map(({ label, icon, path }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive
                  ? 'border-l-2 pl-[10px] font-bold'
                  : 'border-l-2 border-transparent pl-[10px] font-medium hover:bg-[#D9D2C7]/30',
              ].join(' ')
            }
            style={({ isActive }) => ({
              color: isActive ? '#6B7A2E' : '#4A4E52',
              backgroundColor: isActive ? 'rgba(255,255,255,0.5)' : undefined,
              borderLeftColor: isActive ? '#6B7A2E' : 'transparent',
            })}
          >
            {({ isActive }) => (
              <>
                <span
                  className="material-symbols-outlined text-[18px] leading-none"
                  style={{ color: isActive ? '#6B7A2E' : '#4A4E52' }}
                >
                  {icon}
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Sign out */}
      <div
        className="px-3 pb-5 pt-4"
        style={{ borderTop: '1px solid #D9D2C7' }}
      >
        <button
          onClick={() => signOut()}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-[#D9D2C7]/30"
          style={{ color: '#4A4E52' }}
        >
          <span className="material-symbols-outlined text-[18px] leading-none">
            logout
          </span>
          Sign Out
        </button>
      </div>
    </aside>
  )
}
