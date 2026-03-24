import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from './_lib/errors'
import { createUserClient } from './_lib/supabase'

export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }

  const supabase = createUserClient(req)
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
  const offset = parseInt(req.query.offset as string) || 0
  const tag = req.query.tag as string

  let query = supabase
    .from('lessons')
    .select('*')
    .order('relevance_score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (tag) query = query.contains('tags', [tag])

  const { data, error } = await query
  if (error) throw error

  return res.status(200).json({ data })
})
