import { useState } from 'react'
import { NavLink } from 'react-router'
import { useAuth } from '../features/auth/authContext'

// Page title at the top, and the main navigation as a floating tab bar at the
// bottom of the screen, where a thumb can reach it on a phone.
export function TopBar({ title }: { title: string }) {
  const { displayName, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <>
      <header className="topbar">
        <h1>{title}</h1>
        <button className="avatar" onClick={() => setMenuOpen(true)} aria-label="Account">
          {initials(displayName)}
        </button>
      </header>

      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4.5" y="3" width="15" height="18" rx="3" />
            <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
          </svg>
          Bills
        </NavLink>
        <NavLink to="/paychecks">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
          Paychecks
        </NavLink>
        <NavLink to="/transactions">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7h13M7 12h13M7 17h9" />
            <circle cx="3.5" cy="7" r="0.6" />
            <circle cx="3.5" cy="12" r="0.6" />
            <circle cx="3.5" cy="17" r="0.6" />
          </svg>
          Transactions
        </NavLink>
        <NavLink to="/budget">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3a9 9 0 1 0 9 9h-9z" />
            <path d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
          </svg>
          Budget
        </NavLink>
      </nav>

      {menuOpen && (
        <div className="sheet-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="sheet form" role="dialog" aria-label="Account" onClick={(e) => e.stopPropagation()}>
            <h2>{displayName ?? 'Account'}</h2>
            <button className="danger" onClick={signOut}>
              Sign out
            </button>
            <button className="secondary" onClick={() => setMenuOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function initials(name: string | null) {
  if (!name) return '•'
  const parts = name.trim().split(/\s+/)
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}
