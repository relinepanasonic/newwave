import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const SESSION_LABELS: Record<number, string> = Object.fromEntries(
  Array.from({ length: 24 }, (_, i) => [
    i + 1,
    `${String(i).padStart(2, '0')}:00 – ${String(i + 1).padStart(2, '0')}:00`,
  ])
)

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function getPayPeriod(date: Date = new Date()): { start: Date; end: Date; label: string } {
  const d = date.getDate()
  const m = date.getMonth()
  const y = date.getFullYear()
  let start: Date, end: Date
  if (d >= 21) {
    start = new Date(y, m, 21)
    end = new Date(y, m + 1, 20)
  } else {
    start = new Date(y, m - 1, 21)
    end = new Date(y, m, 20)
  }
  const fmt = (d: Date) =>
    d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
}

// Use local date to avoid UTC timezone shift (important for Indonesia UTC+7)
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getWeekDates(baseDate: Date): Date[] {
  const day = baseDate.getDay()
  const monday = new Date(baseDate)
  monday.setDate(baseDate.getDate() - ((day + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

export const PLATFORM_COLORS: Record<string, string> = {
  Shopee:    'bg-orange-100 text-orange-800',
  TikTok:    'bg-pink-100 text-pink-800',
  Instagram: 'bg-purple-100 text-purple-800',
  YouTube:   'bg-red-100 text-red-800',
  Other:     'bg-gray-100 text-gray-700',
}

export const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  live:      'bg-green-100 text-green-800',
  done:      'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
}
