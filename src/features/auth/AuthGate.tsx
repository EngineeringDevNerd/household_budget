import type { ReactNode } from 'react'
import { isSupabaseConfigured } from '../../lib/supabase'
import { useAuth } from './authContext'
import { SignInPage } from './SignInPage'

// Everything inside this gate needs a signed-in household member.
export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, memberStatus, signOut } = useAuth()

  if (!isSupabaseConfigured) {
    return (
      <main className="page narrow">
        <h1>Household Budget</h1>
        <p className="warn">This build is missing its Supabase settings. Check the GitHub repository variables.</p>
      </main>
    )
  }
  if (loading) return <main className="page narrow"><p>Loading…</p></main>
  if (!session) return <SignInPage />
  if (memberStatus === 'unknown') return <main className="page narrow"><p>Loading…</p></main>
  if (memberStatus === 'not-member') {
    return (
      <main className="page narrow">
        <h1>Not on the household list</h1>
        <p>
          You’re signed in as {session.user.email}, but this account hasn’t been added to the
          household yet, so there’s nothing to show.
        </p>
        <button onClick={signOut}>Sign out</button>
      </main>
    )
  }
  return <>{children}</>
}
