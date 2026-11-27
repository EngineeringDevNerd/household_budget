import { useAuth } from '../auth/authContext'

// Placeholder until the bills board lands.
export function HomePage() {
  const { displayName, signOut } = useAuth()
  return (
    <main className="page">
      <header className="topbar">
        <h1>Household Budget</h1>
        <button className="link" onClick={signOut}>Sign out</button>
      </header>
      <p>Hi {displayName}. You’re signed in. Bills and paychecks are coming next.</p>
    </main>
  )
}
