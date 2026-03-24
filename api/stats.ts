import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from './_lib/errors'
import { createUserClient } from './_lib/supabase'

export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }

  const supabase = createUserClient(req)
  const dateFrom = req.query.date_from as string
  const dateTo = req.query.date_to as string

  let query = supabase.from('tracked_trades').select('*')
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', dateTo)

  const { data: trades, error } = await query
  if (error) throw error

  const all = trades || []
  const tracking = all.filter(t => t.status === 'tracking')
  const success = all.filter(t => t.status === 'success')
  const failed = all.filter(t => t.status === 'failed')
  const expired = all.filter(t => t.status === 'expired')
  const resolved = [...success, ...failed, ...expired]

  const winRate = resolved.length > 0 ? (success.length / resolved.length) * 100 : 0
  const totalPnl = resolved.reduce((sum, t) => sum + (t.pnl_percent || 0), 0)
  const avgPnl = resolved.length > 0 ? totalPnl / resolved.length : 0

  return res.status(200).json({
    total: all.length,
    tracking: tracking.length,
    success: success.length,
    failed: failed.length,
    expired: expired.length,
    winRate: Math.round(winRate * 100) / 100,
    avgPnl: Math.round(avgPnl * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
  })
})
