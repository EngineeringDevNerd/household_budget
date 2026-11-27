import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

// Injected at build time from the GitHub repository variables (or .env.local).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key)

export const supabase = isSupabaseConfigured
  ? createClient<Database>(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
