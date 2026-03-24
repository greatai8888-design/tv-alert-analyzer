import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from '../_lib/errors'
import { createUserClient } from '../_lib/supabase'

export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }

  const supabase = createUserClient(req)
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
  const offset = parseInt(req.query.offset as string) || 0
  const ticker = req.query.ticker as string
  const recommendation = req.query.recommendation as string
  const dateFrom = req.query.date_from as string
  const dateTo = req.query.date_to as string

  let query = supabase
    .from('alerts')
    .select('*, analyses(*)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (ticker) query = query.ilike('ticker', `%${ticker}%`)
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', dateTo)

  const { data, error, count } = await query
  if (error) throw error

  // Filter by recommendation if specified (needs post-query filter since it's in analyses)
  let filtered = data
  if (recommendation && data) {
    filtered = data.filter((a: any) =>
      a.analyses?.some((an: any) => an.recommendation === recommendation.toUpperCase())
    )
  }

  return res.status(200).json({ data: filtered, total: count })
})
