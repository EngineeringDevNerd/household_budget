import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type MemberStatus = 'unknown' | 'member' | 'not-member'

export type AuthState = {
  loading: boolean
  session: Session | null
  displayName: string | null
  memberStatus: MemberStatus
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
