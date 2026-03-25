import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminClient } from '../_lib/supabase.js'
import { config } from '../_lib/config.js'

/**
 * Fallback cron: picks up pending alerts that the fire-and-forget
 * Edge Function invocation missed (network error, etc.) or that
 * got stuck in "processing" for too long (Edge Function timed out).
 *
 * Runs every minute via Vercel Cron.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Validate cron secret
  if (req.headers.authorization !== `Bearer ${config.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Find alerts that need processing:
    // 1. status = 'pending' (fire-and-forget never fired)
    // 2. status = 'processing' AND started_at > 5 minutes ago (timed out)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    const { data: pendingAlerts } = await adminClient
      .from('pending_alerts')
      .select('id')
      .or(`status.eq.pending,and(status.eq.processing,started_at.lt.${fiveMinAgo})`)
      .order('created_at', { ascending: true })
      .limit(10) // Process at most 10 per cron run

    if (!pendingAlerts || pendingAlerts.length === 0) {
      return res.status(200).json({ processed: 0 })
    }

    console.log(`[process-pending] Found ${pendingAlerts.length} alerts to retry`)

    // Invoke Edge Function for each pending alert (parallel, fire-and-forget)
    const edgeFnUrl = `${config.SUPABASE_URL}/functions/v1/process-alert`
    const results = await Promise.allSettled(
      pendingAlerts.map(alert =>
        fetch(edgeFnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ pending_id: alert.id }),
        })
      )
    )

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    console.log(`[process-pending] Dispatched: ${succeeded} ok, ${failed} failed`)

    return res.status(200).json({
      processed: pendingAlerts.length,
      succeeded,
      failed,
    })
  } catch (err: any) {
    console.error('[process-pending] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
