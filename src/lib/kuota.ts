// Shared Kuota (live-hour quota) rules, used by both the Client List meters
// and the Schedule page's pre-booking warning so the two can never disagree.
//
// The model: a client buys live hours per tier ("NW Regular Live Only" 144
// hour, "NW Silver Live Only" 84 hour). Delivered/scheduled sessions draw
// down the tier named by the schedule slot's Tipe Live. Non-live lines (UGC,
// pre content, Prime Time addons — anything not hour-scaled) are billing
// only and never touch quota.
//
// Whether a line counts as quota is decided purely by its Qty/scale, never by
// its description: ProOne's line names are inconsistent (generic "Service
// Item", "3 month Contracts…") but the Qty column ("50 hour") is reliable.
// A line's *name* is only ever used afterwards, to guess which tier
// (Regular/Silver/…) an already-counted hour line belongs to.

// Live tiers that consume hour quota. A slot tagged with anything else
// (UGC, Pre Content, Background Design, Other) is an add-on service.
export const QUOTA_TIERS = ['Regular', 'Silver', 'Gold', 'Platinum', 'Rubi']

// Bucket for hours/quota we can't pin to a tier — legacy CSV-imported reports
// with no schedule slot, and hour lines that name no tier.
export const UNTAGGED = 'Untagged'

// invoice_items carry no tier column, and their names don't match
// nw_packages.name ("NW Regular Live Only" vs "NW Regular Package"), so the
// tier is read out of the line's own name. A line with no tier keyword in its
// name (generic "Service Item", "3 month Contracts…") still counts as quota
// -- it just lands in the untiered pool instead of Regular/Silver/etc.
export function tierFromItemName(name?: string | null): string | null {
  const n = (name || '').toLowerCase()
  return QUOTA_TIERS.find(t => n.includes(t.toLowerCase())) || null
}

// Hours an invoice line contributes to quota: any hour-scaled line, full
// stop -- a "36 pc" UGC line must not inflate live quota, but a "50 hour"
// line counts regardless of what its description says.
export function itemQuotaHours(it: { scale?: string | null; qty: number }): number {
  if ((it.scale || '').toLowerCase() !== 'hour') return 0
  return Number(it.qty) || 0
}

// Which quota bucket a delivered/scheduled session draws from, based on the
// schedule slot's Tipe Live. Returns null when the slot names a non-live
// service, so it's left out of quota entirely.
export function tierFromSlot(tipeLive?: string | null): string | null {
  if (!tipeLive) return UNTAGGED
  return QUOTA_TIERS.find(t => t.toLowerCase() === tipeLive.trim().toLowerCase()) || null
}

// Which quota bucket a live_report draws from. Most reports have no
// schedule_slot at all (filed without picking one), so there's often no slot
// to tag -- tier_override lets an admin tag the report itself directly, and
// takes priority over the linked slot's Tipe Live when both are present.
export function tierFromReport(tierOverride?: string | null, slotTipeLive?: string | null): string | null {
  if (tierOverride) return QUOTA_TIERS.find(t => t.toLowerCase() === tierOverride.trim().toLowerCase()) || UNTAGGED
  return tierFromSlot(slotTipeLive)
}
