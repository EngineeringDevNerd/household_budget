import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { AuthContext, type MemberStatus } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(Boolean(supabase))
  const [session, setSession] = useState<Session | null>(null)
  // Membership result, tagged with the user it belongs to so a stale answer
  // for a previous user is never shown.
  const [member, setMember] = useState<{ userId: string; name: string | null } | null>(null)

  // Keep the session in sync with Supabase (sign-in, sign-out, token refresh).
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Is this account on the household list? RLS only lets members read the
  // list, so a signed-in non-member gets zero rows back.
  const userId = session?.user.id
  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    supabase
      .from('household_members')
      .select('display_name')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        setMember({ userId, name: error || !data ? null : (data.display_name as string) })
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const current = member && member.userId === userId ? member : null
  const memberStatus: MemberStatus = !current ? 'unknown' : current.name ? 'member' : 'not-member'
  const displayName = current?.name ?? null

  async function signIn(email: string, password: string) {
    if (!supabase) return 'Supabase is not configured for this build.'
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error) return null
      const msg = error.message.toLowerCase()
      if (msg.includes('invalid login credentials')) return 'That email and password don’t match.'
      if (msg.includes('fetch')) return 'Couldn’t reach the server. Check your connection and try again.'
      return error.message
    } catch {
      return 'Couldn’t reach the server. Check your connection and try again.'
    }
  }

  async function signOut() {
    await supabase?.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ loading, session, displayName, memberStatus, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
