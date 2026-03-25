import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from './_lib/errors.js'
import { adminClient } from './_lib/supabase.js'
import { config } from './_lib/config.js'
import type { TradingViewAlert } from './_lib/types.js'

/**
 * Thin webhook handler: validate → enqueue → return 200 immediately.
 * Heavy processing (AI analysis, sim trading, etc.) is done by the
 * Supabase Edge Function "process-alert" invoked fire-and-forget.
 */
export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }

  // Validate webhook secret
  if (config.WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== config.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  }

  const alert: TradingViewAlert = req.body
  if (!alert.ticker) {
    return res.status(400).json({ error: 'Missing ticker', code: 'MISSING_TICKER' })
  }

  const ticker = alert.ticker.toUpperCase()
  const exchange = (alert.exchange || 'NASDAQ').toUpperCase()
  const timeframe = alert.timeframe || 'D'

  // Get default user
  const { data: defaultUser } = await adminClient
    .from('profiles')
    .select('id')
    .limit(1)
    .single()

  if (!defaultUser) {
    return res.status(500).json({ error: 'No user found', code: 'NO_USER' })
  }

  // ── Enqueue: insert into pending_alerts ──
  const { data: pending, error: insertErr } = await adminClient
    .from('pending_alerts')
    .insert({
      user_id: defaultUser.id,
      ticker,
      exchange,
      timeframe,
      price: alert.price || null,
      action: alert.message?.toLowerCase().includes('sell') ? 'sell' : 'buy',
      message: alert.message || '',
      raw_payload: alert as any,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertErr || !pending) {
    console.error('Failed to enqueue alert:', insertErr)
    return res.status(500).json({ error: 'Failed to enqueue', code: 'ENQUEUE_FAILED' })
  }

  // ── Return 200 immediately (TradingView is happy) ──
  res.status(200).json({
    success: true,
    queued: true,
    pending_id: pending.id,
    ticker,
  })

  // ── Fire-and-forget: invoke Supabase Edge Function ──
  const edgeFnUrl = `${config.SUPABASE_URL}/functions/v1/process-alert`
  fetch(edgeFnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ pending_id: pending.id }),
  }).catch(err =>
    console.error(`[webhook] Failed to invoke Edge Function: ${err.message}`)
  )
})
