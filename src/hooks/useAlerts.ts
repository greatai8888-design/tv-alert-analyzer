import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Alert } from '../types'

export function useAlerts(filters?: {
  ticker?: string
  recommendation?: string
  limit?: number
  offset?: number
}) {
  return useQuery({
    queryKey: ['alerts', filters],
    queryFn: async () => {
      let query = supabase
        .from('alerts')
        .select('*, analyses(*)')
        .order('created_at', { ascending: false })
        .limit(filters?.limit ?? 20)

      if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 20) - 1)
      if (filters?.ticker) query = query.ilike('ticker', `%${filters.ticker}%`)

      const { data, error } = await query
      if (error) throw error
      return data as Alert[]
    },
  })
}

export function useAlert(id: string) {
  return useQuery({
    queryKey: ['alerts', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*, analyses(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Alert
    },
    enabled: !!id,
  })
}
