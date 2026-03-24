import { createClient } from '@supabase/supabase-js'
import type { VercelRequest } from '@vercel/node'
import { config } from './config'

// Admin client for webhook/cron (bypasses RLS)
export const adminClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)

// User client from JWT (respects RLS)
export function createUserClient(req: VercelRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) throw new Error('Missing authorization header')

  return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}
