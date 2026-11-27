import { NavLink } from 'react-router'
import { useAuth } from '../features/auth/authContext'

export function TopBar({ title }: { title: string }) {
  const { displayName, signOut } = useAuth()
  return (
    <header className="topbar">
      <h1>{title}</h1>
      <nav className="nav">
        <NavLink to="/" end>
          Bills
        </NavLink>
        <NavLink to="/paychecks">Paychecks</NavLink>
        <button className="link" onClick={signOut} title={displayName ? `Signed in as ${displayName}` : undefined}>
          Sign out
        </button>
      </nav>
    </header>
  )
}
