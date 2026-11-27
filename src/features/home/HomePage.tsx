import { isSupabaseConfigured } from '../../lib/supabase'

// Placeholder until the bills board lands. It proves the deploy works and
// that the build picked up the Supabase settings.
export function HomePage() {
  return (
    <main className="page">
      <h1>Household Budget</h1>
      <p>The app skeleton is live. Bills and paychecks are coming next.</p>
      <p className={isSupabaseConfigured ? 'ok' : 'warn'}>
        Supabase settings: {isSupabaseConfigured ? 'found' : 'missing (check the GitHub repository variables)'}
      </p>
    </main>
  )
}
