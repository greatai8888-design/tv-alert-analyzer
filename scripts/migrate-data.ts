/**
 * Data Migration Script: Old Schema → New Schema
 *
 * Usage:
 *   npx tsx scripts/migrate-data.ts
 *   npx tsx scripts/migrate-data.ts --dry-run
 *
 * Required env vars:
 *   OLD_SUPABASE_URL       - URL of the old Supabase project
 *   OLD_SUPABASE_KEY       - Anon or service key for the old project
 *   NEW_SUPABASE_URL       - URL of the new Supabase project
 *   NEW_SUPABASE_SERVICE_KEY - Service role key for the new project
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes('--dry-run')

const OLD_URL = process.env.OLD_SUPABASE_URL
const OLD_KEY = process.env.OLD_SUPABASE_KEY
const NEW_URL = process.env.NEW_SUPABASE_URL
const NEW_KEY = process.env.NEW_SUPABASE_SERVICE_KEY

if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error(
    'Missing required env vars: OLD_SUPABASE_URL, OLD_SUPABASE_KEY, NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY'
  )
  process.exit(1)
}

const oldDb: SupabaseClient = createClient(OLD_URL, OLD_KEY)
const newDb: SupabaseClient = createClient(NEW_URL, NEW_KEY)

// ---------------------------------------------------------------------------
// Old schema types (source)
// ---------------------------------------------------------------------------

interface OldAlert {
  id: number
  ticker: string
  exchange: string | null
  timeframe: string | null
  price: string | number | null
  message: string | null
  chart_url: string | null
  created_at: string
}

interface OldAnalysis {
  id: number
  alert_id: number
  pattern: string | null
  trend: string | null
  trend_strength: string | null
  support_levels: string | null
  resistance_levels: string | null
  rsi_reading: string | null
  recommendation: string | null
  confidence: number | null
  entry_price: string | null
  stop_loss: string | null
  take_profit: string | null
  reasoning: string | null
  raw_response: string | null
  created_at: string
}

interface OldTrackedTrade {
  id: number
  alert_id: number
  ticker: string
  exchange: string | null
  recommendation: string | null
  entry_price: number | null
  stop_loss: number | null
  take_profit: number | null
  confidence: number | null
  current_price: number | null
  status: string | null
  pnl_percent: number | null
  result_reason: string | null
  created_at: string
  closed_at: string | null
}

interface OldLesson {
  id: number
  tracked_trade_id: number | null
  ticker: string
  lesson_type: string | null
  original_analysis: string | null
  what_happened: string | null
  lesson_learned: string | null
  created_at: string
}

interface OldFavorite {
  id: number
  alert_id: number
  ticker: string | null
  note: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract first numeric value from a text string, e.g. "$123.45" → 123.45 */
function parseNumericText(text: string | null | undefined): number | null {
  if (!text) return null
  const match = text.match(/[-+]?\d+(?:[.,]\d+)?/)
  if (!match) return null
  const cleaned = match[0].replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

/**
 * Extract first numeric value from a string that may represent a list, e.g.
 * "[120.5, 118.0]" → 120.5
 */
function parseFirstNumericFromList(text: string | null | undefined): number | null {
  if (!text) return null
  return parseNumericText(text)
}

/** Derive action from alert message content */
function deriveAction(message: string | null | undefined): string {
  if (!message) return 'ALERT'
  const upper = message.toUpperCase()
  if (upper.includes('BUY') || upper.includes('LONG')) return 'BUY'
  if (upper.includes('SELL') || upper.includes('SHORT')) return 'SELL'
  if (upper.includes('HOLD')) return 'HOLD'
  return 'ALERT'
}

/** Parse raw_response text to JSONB-compatible object */
function parseRawResponse(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    // If not valid JSON, wrap as text
    return { text: raw }
  }
}

/** Add 7 days to an ISO date string */
function addSevenDays(isoDate: string): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + 7)
  return d.toISOString()
}

// ---------------------------------------------------------------------------
// Summary tracking
// ---------------------------------------------------------------------------

const summary: Record<string, { migrated: number; errors: number }> = {
  alerts: { migrated: 0, errors: 0 },
  analyses: { migrated: 0, errors: 0 },
  tracked_trades: { migrated: 0, errors: 0 },
  lessons: { migrated: 0, errors: 0 },
  favorites: { migrated: 0, errors: 0 },
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== Data Migration Script ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`)
  console.log()

  // -------------------------------------------------------------------------
  // Resolve default user
  // -------------------------------------------------------------------------
  console.log('Resolving default user from new DB...')
  const { data: profileRows, error: profileErr } = await newDb
    .from('profiles')
    .select('id, email')
    .limit(1)
    .order('created_at', { ascending: true })

  if (profileErr) {
    console.error('Failed to fetch profiles from new DB:', profileErr.message)
    process.exit(1)
  }

  if (!profileRows || profileRows.length === 0) {
    console.error('No profiles found in new DB. Create a user first, then re-run.')
    process.exit(1)
  }

  const userId: string = profileRows[0].id
  console.log(`Using user_id: ${userId} (${profileRows[0].email ?? 'no email'})\n`)

  // ID mapping tables: old numeric id → new UUID string
  const alertIdMap = new Map<number, string>()
  const analysisIdMap = new Map<number, string>()
  const tradeIdMap = new Map<number, string>()

  // -------------------------------------------------------------------------
  // 1. Alerts
  // -------------------------------------------------------------------------
  const { data: oldAlerts, error: oldAlertsErr } = await oldDb
    .from('alerts')
    .select('*')
    .order('id', { ascending: true })

  if (oldAlertsErr) {
    console.error('Failed to read old alerts:', oldAlertsErr.message)
    process.exit(1)
  }

  const alerts: OldAlert[] = (oldAlerts ?? []) as OldAlert[]
  console.log(`Migrating alerts: ${alerts.length} records...`)

  for (const a of alerts) {
    const rawPayload: Record<string, unknown> = {}
    if (a.chart_url) rawPayload.chart_url = a.chart_url

    const newAlert = {
      user_id: userId,
      ticker: a.ticker,
      exchange: a.exchange ?? null,
      timeframe: a.timeframe ?? null,
      price: a.price != null ? Number(a.price) : null,
      action: deriveAction(a.message),
      message: a.message ?? null,
      raw_payload: Object.keys(rawPayload).length > 0 ? rawPayload : null,
      created_at: a.created_at,
      updated_at: a.created_at,
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Alert old_id=${a.id} → ${JSON.stringify(newAlert)}`)
      summary.alerts.migrated++
      // Assign a placeholder so downstream FK lookups still work in dry-run logs
      alertIdMap.set(a.id, `dry-run-alert-${a.id}`)
      continue
    }

    const { data: inserted, error } = await newDb
      .from('alerts')
      .insert(newAlert)
      .select('id')
      .single()

    if (error || !inserted) {
      console.error(`  ERROR alert old_id=${a.id}:`, error?.message ?? 'no data returned')
      summary.alerts.errors++
    } else {
      alertIdMap.set(a.id, inserted.id)
      summary.alerts.migrated++
    }
  }

  // -------------------------------------------------------------------------
  // 2. Analyses
  // -------------------------------------------------------------------------
  const { data: oldAnalyses, error: oldAnalysesErr } = await oldDb
    .from('analyses')
    .select('*')
    .order('id', { ascending: true })

  if (oldAnalysesErr) {
    console.error('Failed to read old analyses:', oldAnalysesErr.message)
    process.exit(1)
  }

  const analyses: OldAnalysis[] = (oldAnalyses ?? []) as OldAnalysis[]
  console.log(`Migrating analyses: ${analyses.length} records...`)

  for (const an of analyses) {
    const newAlertId = alertIdMap.get(an.alert_id)
    if (!newAlertId) {
      console.error(
        `  ERROR analysis old_id=${an.id}: no mapped alert for old alert_id=${an.alert_id}`
      )
      summary.analyses.errors++
      continue
    }

    const newAnalysis = {
      alert_id: newAlertId,
      user_id: userId,
      recommendation: an.recommendation ?? 'HOLD',
      confidence: an.confidence ?? null,
      summary: an.reasoning ?? null,
      entry_price: parseNumericText(an.entry_price),
      stop_loss: parseNumericText(an.stop_loss),
      take_profit: parseNumericText(an.take_profit),
      support_price: parseFirstNumericFromList(an.support_levels),
      resistance_price: parseFirstNumericFromList(an.resistance_levels),
      rsi: parseNumericText(an.rsi_reading),
      sma_20: null,
      sma_50: null,
      sma_200: null,
      macd_signal: null,
      volume_trend: null,
      market_context: null,
      news_context: null,
      chart_urls: null,
      model_used: 'claude-sonnet-4-20250514',
      prompt_version: 'v1.0',
      raw_response: parseRawResponse(an.raw_response),
      created_at: an.created_at,
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Analysis old_id=${an.id} → alert_id=${newAlertId}`)
      summary.analyses.migrated++
      analysisIdMap.set(an.id, `dry-run-analysis-${an.id}`)
      continue
    }

    const { data: inserted, error } = await newDb
      .from('analyses')
      .insert(newAnalysis)
      .select('id')
      .single()

    if (error || !inserted) {
      console.error(`  ERROR analysis old_id=${an.id}:`, error?.message ?? 'no data returned')
      summary.analyses.errors++
    } else {
      analysisIdMap.set(an.id, inserted.id)
      summary.analyses.migrated++
    }
  }

  // -------------------------------------------------------------------------
  // 3. Tracked Trades
  // -------------------------------------------------------------------------
  const { data: oldTrades, error: oldTradesErr } = await oldDb
    .from('tracked_trades')
    .select('*')
    .order('id', { ascending: true })

  if (oldTradesErr) {
    console.error('Failed to read old tracked_trades:', oldTradesErr.message)
    process.exit(1)
  }

  const trades: OldTrackedTrade[] = (oldTrades ?? []) as OldTrackedTrade[]
  console.log(`Migrating tracked_trades: ${trades.length} records...`)

  for (const t of trades) {
    // Find analysis for this trade's alert
    // We look for the most recently created analysis for that alert (first one inserted)
    let analysisId: string | undefined

    if (!DRY_RUN) {
      // Look up by alert_id in the new analyses table via the mapped alert UUID
      const newAlertId = alertIdMap.get(t.alert_id)
      if (newAlertId) {
        const { data: foundAnalyses } = await newDb
          .from('analyses')
          .select('id')
          .eq('alert_id', newAlertId)
          .order('created_at', { ascending: true })
          .limit(1)

        analysisId = foundAnalyses?.[0]?.id
      }
    } else {
      analysisId = `dry-run-analysis-for-alert-${t.alert_id}`
    }

    if (!analysisId) {
      console.error(
        `  ERROR tracked_trade old_id=${t.id}: could not resolve analysis_id for alert_id=${t.alert_id}`
      )
      summary.tracked_trades.errors++
      continue
    }

    const newTrade = {
      user_id: userId,
      analysis_id: analysisId,
      ticker: t.ticker,
      recommendation: t.recommendation ?? 'BUY',
      entry_price: t.entry_price ?? 0,
      current_price: t.current_price ?? null,
      stop_loss: t.stop_loss ?? null,
      take_profit: t.take_profit ?? null,
      status: t.status ?? 'tracking',
      pnl_percent: t.pnl_percent ?? null,
      resolved_at: t.closed_at ?? null,
      expires_at: addSevenDays(t.created_at),
      confidence: t.confidence ?? 0,
      notes: t.result_reason ?? null,
      created_at: t.created_at,
      updated_at: t.closed_at ?? t.created_at,
    }

    if (DRY_RUN) {
      console.log(
        `  [DRY RUN] Trade old_id=${t.id} → analysis_id=${analysisId}, ticker=${t.ticker}`
      )
      summary.tracked_trades.migrated++
      tradeIdMap.set(t.id, `dry-run-trade-${t.id}`)
      continue
    }

    const { data: inserted, error } = await newDb
      .from('tracked_trades')
      .insert(newTrade)
      .select('id')
      .single()

    if (error || !inserted) {
      console.error(`  ERROR tracked_trade old_id=${t.id}:`, error?.message ?? 'no data returned')
      summary.tracked_trades.errors++
    } else {
      tradeIdMap.set(t.id, inserted.id)
      summary.tracked_trades.migrated++
    }
  }

  // -------------------------------------------------------------------------
  // 4. Lessons
  // -------------------------------------------------------------------------
  const { data: oldLessons, error: oldLessonsErr } = await oldDb
    .from('lessons')
    .select('*')
    .order('id', { ascending: true })

  if (oldLessonsErr) {
    console.error('Failed to read old lessons:', oldLessonsErr.message)
    process.exit(1)
  }

  const lessons: OldLesson[] = (oldLessons ?? []) as OldLesson[]
  console.log(`Migrating lessons: ${lessons.length} records...`)

  for (const l of lessons) {
    const tradeId =
      l.tracked_trade_id != null ? tradeIdMap.get(l.tracked_trade_id) ?? null : null

    if (l.tracked_trade_id != null && !tradeId) {
      console.warn(
        `  WARN lesson old_id=${l.id}: could not resolve trade_id for tracked_trade_id=${l.tracked_trade_id}, setting null`
      )
    }

    // Combine what_happened + lesson_learned → lesson_text
    const parts: string[] = []
    if (l.what_happened) parts.push(l.what_happened)
    if (l.lesson_learned) parts.push(l.lesson_learned)
    const lessonText = parts.join('\n\n') || '(no details)'

    const newLesson = {
      user_id: userId,
      trade_id: tradeId,
      ticker: l.ticker,
      lesson_type: l.lesson_type ?? 'general',
      lesson_text: lessonText,
      key_takeaway: l.lesson_learned ?? lessonText,
      tags: [] as string[],
      original_analysis: l.original_analysis ? { text: l.original_analysis } : null,
      market_conditions: null,
      relevance_score: 50,
      times_used: 0,
      created_at: l.created_at,
    }

    if (DRY_RUN) {
      console.log(
        `  [DRY RUN] Lesson old_id=${l.id} → trade_id=${tradeId}, ticker=${l.ticker}`
      )
      summary.lessons.migrated++
      continue
    }

    const { error } = await newDb.from('lessons').insert(newLesson)

    if (error) {
      console.error(`  ERROR lesson old_id=${l.id}:`, error.message)
      summary.lessons.errors++
    } else {
      summary.lessons.migrated++
    }
  }

  // -------------------------------------------------------------------------
  // 5. Favorites
  // -------------------------------------------------------------------------
  const { data: oldFavorites, error: oldFavoritesErr } = await oldDb
    .from('favorites')
    .select('*')
    .order('id', { ascending: true })

  if (oldFavoritesErr) {
    console.error('Failed to read old favorites:', oldFavoritesErr.message)
    process.exit(1)
  }

  const favorites: OldFavorite[] = (oldFavorites ?? []) as OldFavorite[]
  console.log(`Migrating favorites: ${favorites.length} records...`)

  for (const f of favorites) {
    const newAlertId = alertIdMap.get(f.alert_id)
    if (!newAlertId) {
      console.error(
        `  ERROR favorite old_id=${f.id}: no mapped alert for old alert_id=${f.alert_id}`
      )
      summary.favorites.errors++
      continue
    }

    const newFavorite = {
      user_id: userId,
      alert_id: newAlertId,
      note: f.note ?? null,
      created_at: f.created_at,
    }

    if (DRY_RUN) {
      console.log(
        `  [DRY RUN] Favorite old_id=${f.id} → alert_id=${newAlertId}`
      )
      summary.favorites.migrated++
      continue
    }

    const { error } = await newDb.from('favorites').insert(newFavorite)

    if (error) {
      console.error(`  ERROR favorite old_id=${f.id}:`, error.message)
      summary.favorites.errors++
    } else {
      summary.favorites.migrated++
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n=== Migration Summary ===')
  let totalMigrated = 0
  let totalErrors = 0
  for (const [table, stats] of Object.entries(summary)) {
    console.log(
      `  ${table.padEnd(16)} migrated: ${stats.migrated}  errors: ${stats.errors}`
    )
    totalMigrated += stats.migrated
    totalErrors += stats.errors
  }
  console.log(`\n  Total migrated: ${totalMigrated}  Total errors: ${totalErrors}`)
  if (DRY_RUN) console.log('\n  (DRY RUN — no data was written)')
  console.log()
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
