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
    case 'BUY': return 'text-green-500'
    case 'SELL': return 'text-red-500'
    case 'HOLD': return 'text-amber-500'
    default: return 'text-gray-500'
  }
}

export function recommendationBgColor(rec: string): string {
  switch (rec) {
    case 'BUY': return 'bg-green-500/10 text-green-400 border-green-500/20'
    case 'SELL': return 'bg-red-500/10 text-red-400 border-red-500/20'
    case 'HOLD': return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
  }
}
