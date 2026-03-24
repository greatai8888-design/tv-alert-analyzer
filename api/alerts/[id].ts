import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from '../_lib/errors.js'
import { createUserClient } from '../_lib/supabase.js'

export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }

  const supabase = createUserClient(req)
  const { id } = req.query

  const { data, error } = await supabase
    .from('alerts')
    .select('*, analyses(*)')
    .eq('id', id)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Alert not found', code: 'NOT_FOUND' })
  }

  return res.status(200).json(data)
})
