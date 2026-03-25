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

export interface SimTradeLog {
  id: string
  trade_id: string | null
  portfolio_id: string
  user_id: string
  action: string
  ticker: string
  price: number
  quantity: number | null
  cash_before: number
  cash_after: number
  pnl: number | null
  reasoning: string | null
  created_at: string
}

// ─── Helper: authenticated fetch ────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `API error ${res.status}`)
  }

  return res.json()
}

// ─── Read hooks (Supabase direct — fine with RLS) ───────────

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

export function useTradeLog(portfolioId?: string) {
  return useQuery({
    queryKey: ['sim_trade_log', portfolioId],
    enabled: !!portfolioId,
    queryFn: async () => {
      return apiFetch<SimTradeLog[]>(`/api/sim-trading?action=log&portfolioId=${portfolioId}&limit=50`)
    },
  })
}

// ─── Write hooks (API-backed) ───────────────────────────────

export function useCreatePortfolio() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (capital: number) => {
      return apiFetch<SimPortfolio>('/api/sim-trading?action=create', {
        method: 'POST',
        body: JSON.stringify({ capital }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sim_portfolio'] })
    },
  })
}

export function useManualClose(portfolioId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tradeId: string) => {
      return apiFetch<{ success: boolean; pnl: number; pnl_pct: number }>('/api/sim-trading?action=close', {
        method: 'POST',
        body: JSON.stringify({ tradeId }),
      })
    },
    onMutate: async (tradeId) => {
      await queryClient.cancelQueries({ queryKey: ['sim_trades', portfolioId, 'open'] })
      const prev = queryClient.getQueryData<SimTrade[]>(['sim_trades', portfolioId, 'open'])
      queryClient.setQueryData<SimTrade[]>(['sim_trades', portfolioId, 'open'], old =>
        old?.filter(t => t.id !== tradeId) ?? []
      )
      return { prev }
    },
    onError: (_err, _tradeId, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['sim_trades', portfolioId, 'open'], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sim_portfolio'] })
      queryClient.invalidateQueries({ queryKey: ['sim_trades'] })
      queryClient.invalidateQueries({ queryKey: ['sim_trade_log'] })
    },
  })
}

export function useUpdateTpSl(portfolioId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { tradeId: string; stopLoss?: number | null; takeProfit?: number | null }) => {
      return apiFetch<{ success: boolean }>('/api/sim-trading?action=update-tp-sl', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ['sim_trades', portfolioId, 'open'] })
      const prev = queryClient.getQueryData<SimTrade[]>(['sim_trades', portfolioId, 'open'])
      queryClient.setQueryData<SimTrade[]>(['sim_trades', portfolioId, 'open'], old =>
        old?.map(t => {
          if (t.id !== params.tradeId) return t
          return {
            ...t,
            stop_loss: params.stopLoss !== undefined ? (params.stopLoss ?? t.stop_loss) : t.stop_loss,
            take_profit: params.takeProfit !== undefined ? (params.takeProfit ?? t.take_profit) : t.take_profit,
          }
        }) ?? []
      )
      return { prev }
    },
    onError: (_err, _params, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['sim_trades', portfolioId, 'open'], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sim_trades'] })
    },
  })
}
