import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler, HttpError } from './_lib/errors.js'
import { adminClient, createUserClient } from './_lib/supabase.js'
import { fetchStockData } from './_lib/market-data.js'

async function getUserId(req: VercelRequest): Promise<string> {
  const client = createUserClient(req)
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) throw new HttpError(401, 'Invalid token', 'UNAUTHORIZED')
  return user.id
}

export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  const action = req.query.action as string
  if (!action) {
    return res.status(400).json({ error: 'Missing action parameter', code: 'MISSING_ACTION' })
  }

  const userId = await getUserId(req)

  // ─── POST actions ─────────────────────────────────────────
  if (req.method === 'POST') {
    if (action === 'create') {
      const { capital } = req.body || {}
      if (typeof capital !== 'number' || capital < 1000) {
        throw new HttpError(400, '最低本金 $1,000', 'INVALID_CAPITAL')
      }

      const { data, error } = await adminClient
        .from('sim_portfolio')
        .insert({
          user_id: userId,
          initial_capital: capital,
          cash_balance: capital,
          total_value: capital,
        })
        .select()
        .single()

      if (error) throw new HttpError(500, error.message, 'DB_ERROR')
      return res.status(201).json(data)
    }

    if (action === 'close') {
      const { tradeId } = req.body || {}
      if (!tradeId) throw new HttpError(400, 'Missing tradeId', 'MISSING_TRADE_ID')

      const { data: trade } = await adminClient
        .from('sim_trades')
        .select('id, ticker, user_id, status')
        .eq('id', tradeId)
        .single()

      if (!trade) throw new HttpError(404, 'Trade not found', 'NOT_FOUND')
      if (trade.user_id !== userId) throw new HttpError(403, 'Not your trade', 'FORBIDDEN')
      if (trade.status !== 'open') throw new HttpError(400, 'Trade already closed', 'ALREADY_CLOSED')

      const stockData = await fetchStockData(trade.ticker)
      const exitPrice = stockData?.info.price
      if (!exitPrice) throw new HttpError(502, `無法取得 ${trade.ticker} 的即時價格`, 'PRICE_UNAVAILABLE')

      const { data: result, error } = await adminClient.rpc('close_sim_trade', {
        p_trade_id: tradeId,
        p_exit_price: exitPrice,
        p_close_reason: 'MANUAL',
      })

      if (error) throw new HttpError(500, error.message, 'RPC_ERROR')
      if (result?.error) throw new HttpError(400, result.error, 'CLOSE_FAILED')

      return res.status(200).json(result)
    }

    if (action === 'update-tp-sl') {
      const { tradeId, stopLoss, takeProfit } = req.body || {}
      if (!tradeId) throw new HttpError(400, 'Missing tradeId', 'MISSING_TRADE_ID')

      const { data: trade } = await adminClient
        .from('sim_trades')
        .select('id, user_id, status, entry_price')
        .eq('id', tradeId)
        .single()

      if (!trade) throw new HttpError(404, 'Trade not found', 'NOT_FOUND')
      if (trade.user_id !== userId) throw new HttpError(403, 'Not your trade', 'FORBIDDEN')
      if (trade.status !== 'open') throw new HttpError(400, 'Trade already closed', 'ALREADY_CLOSED')

      const entryPrice = Number(trade.entry_price)

      if (stopLoss != null) {
        if (stopLoss <= 0) throw new HttpError(400, '止損價必須大於 0', 'INVALID_SL')
        if (stopLoss >= entryPrice) throw new HttpError(400, '止損價必須低於進場價', 'INVALID_SL')
      }
      if (takeProfit != null) {
        if (takeProfit <= 0) throw new HttpError(400, '目標價必須大於 0', 'INVALID_TP')
        if (takeProfit <= entryPrice) throw new HttpError(400, '目標價必須高於進場價', 'INVALID_TP')
      }
      if (stopLoss != null && takeProfit != null && stopLoss >= takeProfit) {
        throw new HttpError(400, '止損價必須低於目標價', 'INVALID_TP_SL')
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (stopLoss !== undefined) updates.stop_loss = stopLoss
      if (takeProfit !== undefined) updates.take_profit = takeProfit

      const { error } = await adminClient
        .from('sim_trades')
        .update(updates)
        .eq('id', tradeId)

      if (error) throw new HttpError(500, error.message, 'DB_ERROR')
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: `Unknown POST action: ${action}`, code: 'UNKNOWN_ACTION' })
  }

  // ─── GET actions ──────────────────────────────────────────
  if (req.method === 'GET') {
    if (action === 'portfolio') {
      const { data } = await adminClient
        .from('sim_portfolio')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      return res.status(200).json(data)
    }

    if (action === 'trades') {
      const portfolioId = req.query.portfolioId as string
      const status = req.query.status as string
      if (!portfolioId) throw new HttpError(400, 'Missing portfolioId', 'MISSING_PORTFOLIO_ID')

      let query = adminClient
        .from('sim_trades')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw new HttpError(500, error.message, 'DB_ERROR')
      return res.status(200).json(data)
    }

    if (action === 'log') {
      const portfolioId = req.query.portfolioId as string
      const limit = parseInt(req.query.limit as string) || 50
      if (!portfolioId) throw new HttpError(400, 'Missing portfolioId', 'MISSING_PORTFOLIO_ID')

      const { data, error } = await adminClient
        .from('sim_trade_log')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(Math.min(limit, 100))

      if (error) throw new HttpError(500, error.message, 'DB_ERROR')
      return res.status(200).json(data)
    }

    return res.status(400).json({ error: `Unknown GET action: ${action}`, code: 'UNKNOWN_ACTION' })
  }

  return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
})
