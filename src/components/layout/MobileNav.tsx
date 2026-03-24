import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Bell, TrendingUp, Star, BookOpen } from 'lucide-react'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Alerts', icon: Bell, path: '/alerts' },
  { label: 'Tracking', icon: TrendingUp, path: '/tracking' },
  { label: 'Favorites', icon: Star, path: '/favorites' },
  { label: 'Lessons', icon: BookOpen, path: '/lessons' },
]

export default function MobileNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around h-16"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      {navItems.map(({ label, icon: Icon, path }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className="flex flex-col items-center justify-center flex-1 h-full gap-1"
        >
          {({ isActive }) => (
            <>
              <Icon
                size={20}
                color={isActive ? '#3b82f6' : 'var(--color-text-secondary)'}
              />
              <span
                className="text-[10px] font-medium"
                style={{ color: isActive ? '#3b82f6' : 'var(--color-text-secondary)' }}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
