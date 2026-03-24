import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface SimPortfolio {
  id: string
  user_id: string
  name: string
  initial_capital: number
  cash_balance: number
  total_value: number
  total_pnl: number
  total_pnl_percent: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SimTrade {
  id: string
  user_id: string
  portfolio_id: string
  alert_id: string | null
  ticker: string
  action: 'BUY' | 'SELL'
  quantity: number
  entry_price: number
  current_price: number | null
  exit_price: number | null
  pnl: number
  pnl_percent: number
  confidence: number
  ai_reasoning: string | null
  status: 'open' | 'closed' | 'stopped'
  stop_loss: number | null
  take_profit: number | null
  created_at: string
  closed_at: string | null
  updated_at: string
}

export function useSimPortfolio() {
  return useQuery({
    queryKey: ['sim_portfolio'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sim_portfolio')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as SimPortfolio | null
    },
  })
}

export function useSimTrades(portfolioId?: string, status?: string) {
  return useQuery({
    queryKey: ['sim_trades', portfolioId, status],
    refetchInterval: 30_000,
    enabled: !!portfolioId,
    queryFn: async () => {
      let query = supabase
        .from('sim_trades')
        .select('*')
        .eq('portfolio_id', portfolioId!)
        .order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error
      return data as SimTrade[]
    },
  })
}

export function useCreatePortfolio() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (capital: number) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('sim_portfolio')
        .insert({
          user_id: user.id,
          initial_capital: capital,
          cash_balance: capital,
          total_value: capital,
        })
        .select()
        .single()
      if (error) throw error
      return data as SimPortfolio
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sim_portfolio'] })
    },
  })
}

export function useSimBuy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      portfolioId: string
      ticker: string
      price: number
      amount: number
      confidence: number
      reasoning: string
      alertId?: string
      stopLoss?: number
      takeProfit?: number
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const quantity = Math.floor((params.amount / params.price) * 100) / 100

      // Insert trade
      const { error: tradeError } = await supabase.from('sim_trades').insert({
        user_id: user.id,
        portfolio_id: params.portfolioId,
        alert_id: params.alertId || null,
        ticker: params.ticker,
        action: 'BUY',
        quantity,
        entry_price: params.price,
        current_price: params.price,
        confidence: params.confidence,
        ai_reasoning: params.reasoning,
        stop_loss: params.stopLoss || null,
        take_profit: params.takeProfit || null,
        status: 'open',
      })
      if (tradeError) throw tradeError

      // Fetch current portfolio and update
      const { data: portfolio } = await supabase
        .from('sim_portfolio')
        .select('cash_balance, total_trades')
        .eq('id', params.portfolioId)
        .single()

      if (portfolio) {
        await supabase
          .from('sim_portfolio')
          .update({
            cash_balance: portfolio.cash_balance - (quantity * params.price),
            total_trades: portfolio.total_trades + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', params.portfolioId)
      }

      return { quantity, cost: quantity * params.price }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sim_portfolio'] })
      queryClient.invalidateQueries({ queryKey: ['sim_trades'] })
    },
  })
}

export function useSimSell() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      tradeId: string
      portfolioId: string
      exitPrice: number
      quantity: number
      entryPrice: number
    }) => {
      const pnl = (params.exitPrice - params.entryPrice) * params.quantity
      const pnlPercent = ((params.exitPrice - params.entryPrice) / params.entryPrice) * 100

      // Close the trade
      await supabase
        .from('sim_trades')
        .update({
          exit_price: params.exitPrice,
          pnl: Math.round(pnl * 100) / 100,
          pnl_percent: Math.round(pnlPercent * 100) / 100,
          status: 'closed',
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.tradeId)

      // Update portfolio
      const { data: portfolio } = await supabase
        .from('sim_portfolio')
        .select('*')
        .eq('id', params.portfolioId)
        .single()

      if (portfolio) {
        const cashBack = params.exitPrice * params.quantity
        const newCash = portfolio.cash_balance + cashBack
        const isWin = pnl > 0

        await supabase
          .from('sim_portfolio')
          .update({
            cash_balance: Math.round(newCash * 100) / 100,
            total_pnl: Math.round((portfolio.total_pnl + pnl) * 100) / 100,
            total_pnl_percent: Math.round(((portfolio.total_pnl + pnl) / portfolio.initial_capital) * 10000) / 100,
            winning_trades: portfolio.winning_trades + (isWin ? 1 : 0),
            losing_trades: portfolio.losing_trades + (isWin ? 0 : 1),
            updated_at: new Date().toISOString(),
          })
          .eq('id', params.portfolioId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sim_portfolio'] })
      queryClient.invalidateQueries({ queryKey: ['sim_trades'] })
    },
  })
}
