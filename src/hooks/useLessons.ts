import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Lesson } from '../types'

export function useLessons(tag?: string) {
  return useQuery({
    queryKey: ['lessons', tag],
    queryFn: async () => {
      let query = supabase
        .from('lessons')
        .select('*')
        .order('relevance_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20)

      if (tag) query = query.contains('tags', [tag])

      const { data, error } = await query
      if (error) throw error
      return data as Lesson[]
    },
  })
}
