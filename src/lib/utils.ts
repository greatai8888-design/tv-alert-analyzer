export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatPrice(price: number | null | undefined): string {
  if (price == null) return '—'
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function recommendationColor(rec: string): string {
  switch (rec) {
    case 'BUY': return 'text-primary'
    case 'SELL': return 'text-tertiary'
    case 'HOLD': return 'text-warning'
    default: return 'text-neutral'
  }
}

export function recommendationBgColor(rec: string): string {
  switch (rec) {
    case 'BUY': return 'bg-primary-light text-primary-dark border border-primary/20'
    case 'SELL': return 'bg-tertiary-light text-tertiary-dark border border-tertiary/20'
    case 'HOLD': return 'bg-warning-light text-warning-dark border border-warning/20'
    default: return 'bg-surface text-neutral border border-border'
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'tracking': return 'bg-info-light text-info-dark'
    case 'success': return 'bg-primary-light text-primary-dark'
    case 'failed': return 'bg-tertiary-light text-tertiary-dark'
    case 'expired': return 'bg-surface text-on-surface-variant'
    default: return 'bg-surface text-neutral'
  }
}

export function pnlColor(value: number | null | undefined): string {
  if (value == null) return 'text-neutral'
  return value >= 0 ? 'text-primary-dark' : 'text-tertiary'
}
