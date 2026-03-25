import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from '../_lib/errors.js'
import { config } from '../_lib/config.js'
import { adminClient } from '../_lib/supabase.js'
import { generateWeeklyReview } from '../_lib/outcome-tracker.js'

export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  // Validate cron secret
  const authHeader = req.headers.authorization
  if (config.CRON_SECRET && authHeader !== `Bearer ${config.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  }

  // Get all users with profiles
  const { data: users } = await adminClient
    .from('profiles')
    .select('id')

  if (!users || users.length === 0) {
    return res.status(200).json({ message: 'No users found', reviews: 0 })
  }

  const results = []
  for (const user of users) {
    try {
      const success = await generateWeeklyReview(user.id)
      results.push({ userId: user.id, success })
    } catch (err: any) {
      console.error(`[REVIEW] Error for user ${user.id}:`, err.message)
      results.push({ userId: user.id, success: false, error: err.message })
    }
  }

  const generated = results.filter(r => r.success).length
  console.log(`[REVIEW] Weekly review complete: ${generated}/${users.length} users`)

  return res.status(200).json({
    reviewed: users.length,
    generated,
    results,
  })
})
