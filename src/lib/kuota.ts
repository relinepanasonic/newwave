// Shared Kuota (live-hour quota) rules, used by both the Client List meters
// and the Schedule page's pre-booking warning so the two can never disagree.
//
// The model: a client buys live hours per tier ("NW Regular Live Only" 144
// hour, "NW Silver Live Only" 84 hour). Delivered/scheduled sessions draw
// down the tier named by the schedule slot's Tipe Live. Non-live lines
// (UGC, pre content, Prime Time addons — anything not hour-scaled, plus
// ProOne's generic "Service Item") are billing only and never touch quota.

// Live tiers that consume hour quota. A slot tagged with anything else
// (UGC, Pre Content, Background Design, Other) is an add-on service.
export const QUOTA_TIERS = ['Regular', 'Silver', 'Gold', 'Platinum', 'Rubi']

// Bucket for hours/quota we can't pin to a tier — legacy CSV-imported reports
// with no schedule slot, and hour lines that name no tier.
export const UNTAGGED = 'Untagged'

// ProOne pushes its "-- Custom / Manual --" lines through as a generic
// "Service Item"; those are add-on billing, never live quota.
export function isServiceItem(name?: string | null): boolean {
  return (name || '').trim().toLowerCase() === 'service item'
}

// invoice_items carry no tier column, and their names don't match
// nw_packages.name ("NW Regular Live Only" vs "NW Regular Package"), so the
// tier is read out of the line's own name.
export function tierFromItemName(name?: string | null): string | null {
  const n = (name || '').toLowerCase()
  return QUOTA_TIERS.find(t => n.includes(t.toLowerCase())) || null
}

// Hours an invoice line contributes to quota. Only "hour"-scaled, non-Service
// Item lines count -- a "36 pc" UGC line must not inflate live quota.
export function itemQuotaHours(it: { name?: string | null; scale?: string | null; qty: number }): number {
  if ((it.scale || '').toLowerCase() !== 'hour') return 0
  if (isServiceItem(it.name)) return 0
  return Number(it.qty) || 0
}

// Which quota bucket a delivered/scheduled session draws from, based on the
// schedule slot's Tipe Live. Returns null when the slot names a non-live
// service, so it's left out of quota entirely.
export function tierFromSlot(tipeLive?: string | null): string | null {
  if (!tipeLive) return UNTAGGED
  return QUOTA_TIERS.find(t => t.toLowerCase() === tipeLive.trim().toLowerCase()) || null
}
