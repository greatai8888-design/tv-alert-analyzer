import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Bell,
  TrendingUp,
  Star,
  BookOpen,
  Settings,
  LogOut,
  Tv,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Alerts', icon: Bell, path: '/alerts' },
  { label: 'Tracking', icon: TrendingUp, path: '/tracking' },
  { label: 'Favorites', icon: Star, path: '/favorites' },
  { label: 'Lessons', icon: BookOpen, path: '/lessons' },
  { label: 'Settings', icon: Settings, path: '/settings' },
]

export default function Sidebar() {
  const { signOut } = useAuth()

  return (
    <aside
      className="hidden md:flex flex-col h-screen w-60 shrink-0 fixed left-0 top-0 z-20"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-5"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{ backgroundColor: '#3b82f6' }}
        >
          <Tv size={16} color="#fff" />
        </div>
        <span
          className="font-semibold text-sm leading-tight"
          style={{ color: 'var(--color-text-primary)' }}
        >
          TV Alert Analyzer
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map(({ label, icon: Icon, path }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'border-l-2 pl-[10px]'
                  : 'border-l-2 border-transparent pl-[10px]',
              ].join(' ')
            }
            style={({ isActive }) => ({
              color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              backgroundColor: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
              borderLeftColor: isActive ? '#3b82f6' : 'transparent',
            })}
          >
            {({ isActive }) => (
              <>
                <Icon size={18} color={isActive ? '#3b82f6' : 'var(--color-text-secondary)'} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Sign out */}
      <div className="px-3 pb-5" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
