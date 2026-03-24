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

  const selectClause = recommendation
    ? '*, analyses!inner(*)'
    : '*, analyses(*)'

  let query = supabase
    .from('alerts')
    .select(selectClause, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (ticker) query = query.ilike('ticker', `%${ticker}%`)
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', dateTo)
  if (recommendation) query = (query as any).eq('analyses.recommendation', recommendation.toUpperCase())

  const { data, error, count } = await query
  if (error) throw error

  return res.status(200).json({ data, total: count })
})
