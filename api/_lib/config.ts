function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const config = {
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_ANON_KEY: required('SUPABASE_ANON_KEY'),
  ANTHROPIC_API_KEY: required('ANTHROPIC_API_KEY'),
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  CRON_SECRET: process.env.CRON_SECRET || '',
  MIN_CONFIDENCE: parseInt(process.env.MIN_CONFIDENCE || '60'),
  MAX_TRACKING_DAYS: parseInt(process.env.MAX_TRACKING_DAYS || '7'),
  CACHE_TTL_MARKET: parseInt(process.env.CACHE_TTL_MARKET || '300000'),
  CACHE_TTL_NEWS: parseInt(process.env.CACHE_TTL_NEWS || '900000'),
  ANALYSIS_MODEL: process.env.ANALYSIS_MODEL || 'claude-sonnet-4-20250514',
}
