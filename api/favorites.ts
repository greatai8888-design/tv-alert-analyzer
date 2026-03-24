import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from './_lib/errors'
import { createUserClient } from './_lib/supabase'

export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  const supabase = createUserClient(req)

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('favorites')
      .select('*, alert:alerts(*, analyses(*))')
      .order('created_at', { ascending: false })

    if (error) throw error
    return res.status(200).json({ data })
  }

  if (req.method === 'POST') {
    const { alert_id, note } = req.body
    if (!alert_id) {
      return res.status(400).json({ error: 'Missing alert_id', code: 'MISSING_FIELD' })
    }

    const { data: user } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('favorites')
      .insert({ user_id: user.user!.id, alert_id, note })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') { // unique violation
        return res.status(409).json({ error: 'Already favorited', code: 'DUPLICATE' })
      }
      throw error
    }
    return res.status(201).json(data)
  }

  if (req.method === 'DELETE') {
    const alertId = req.query.alert_id as string
    if (!alertId) {
      return res.status(400).json({ error: 'Missing alert_id', code: 'MISSING_FIELD' })
    }

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('alert_id', alertId)

    if (error) throw error
    return res.status(204).end()
  }

  return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
})
