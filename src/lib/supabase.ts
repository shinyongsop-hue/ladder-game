import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Game = {
  id: string
  title: string
  config: {
    n: number
    autoNames: string[]
    results: string[]
    prizes: string[]
    seed: string
  }
  created_at: string
}

export type Claim = {
  game_id: string
  slot: number
  real_name: string
  claimed_at: string
}
