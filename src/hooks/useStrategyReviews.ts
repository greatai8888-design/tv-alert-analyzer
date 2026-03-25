import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface StrategyReview {
  id: string
  user_id: string
  review_period_start: string
  review_period_end: string
  total_alerts: number
  hits: number
  misses: number
  missed_opportunities: number
  correct_skips: number
  hit_rate: number
  missed_opportunity_rate: number
  top_missed: Array<{ ticker: string; change_pct_7d: number; reason: string }> | null
  top_misses: Array<{ ticker: string; change_pct_7d: number; ai_confidence: number }> | null
  ai_analysis: string | null
  recommendations: Array<{ suggestion: string; reasoning: string; priority: string }> | null
  created_at: string
}

export interface AlertOutcome {
  id: string
  alert_id: string
  ticker: string
  alert_price: number
  alert_date: string
  ai_recommendation: string | null
  ai_confidence: number | null
  ai_reasoning: string | null
  change_pct_1d: number | null
  change_pct_3d: number | null
  change_pct_7d: number | null
  outcome_category: string | null
  created_at: string
}

export function useStrategyReviews() {
  return useQuery({
    queryKey: ['strategy_reviews'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategy_reviews')
        .select('*')
        .order('review_period_end', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as StrategyReview[]
    },
  })
}

export function useAlertOutcomes(periodStart?: string, periodEnd?: string) {
  return useQuery({
    queryKey: ['alert_outcomes', periodStart, periodEnd],
    enabled: !!periodStart && !!periodEnd,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alert_outcomes')
        .select('*')
        .gte('alert_date', periodStart!)
        .lte('alert_date', periodEnd!)
        .not('outcome_category', 'is', null)
        .order('change_pct_7d', { ascending: false })
      if (error) throw error
      return data as AlertOutcome[]
    },
  })
}
