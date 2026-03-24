import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { TrackedTrade } from '../types'

export function useTrackedTrades(status?: string) {
  return useQuery({
    queryKey: ['tracked_trades', status],
    refetchInterval: 60_000,
    queryFn: async () => {
      let query = supabase
        .from('tracked_trades')
        .select('*')
        .order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error
      return data as TrackedTrade[]
    },
  })
}
