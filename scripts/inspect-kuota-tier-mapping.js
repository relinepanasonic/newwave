// Read-only check of the per-tier Kuota mapping, mirroring the logic now in
// src/lib/kuota.ts + ClientsClient. Prints each brand's per-tier meter for a
// given month so the numbers can be sanity-checked against the paper invoice.
// No writes.
//
// Usage: node scripts/inspect-kuota-tier-mapping.js [YYYY-MM]
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

;(function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  })
})()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// --- mirrors src/lib/kuota.ts ---
const QUOTA_TIERS = ['Regular', 'Silver', 'Gold', 'Platinum', 'Rubi']
const UNTAGGED = 'Untagged'
const isServiceItem = n => (n || '').trim().toLowerCase() === 'service item'
const tierFromItemName = n => QUOTA_TIERS.find(t => (n || '').toLowerCase().includes(t.toLowerCase())) || null
const itemQuotaHours = it => {
  if ((it.scale || '').toLowerCase() !== 'hour') return 0
  if (isServiceItem(it.name)) return 0
  return Number(it.qty) || 0
}
const tierFromSlot = tl => {
  if (!tl) return UNTAGGED
  return QUOTA_TIERS.find(t => t.toLowerCase() === tl.trim().toLowerCase()) || null
}

const ym = process.argv[2] || '2026-04'
const [Y, M] = ym.split('-').map(Number)
const start = `${ym}-01`
const end = `${ym}-${String(new Date(Y, M, 0).getDate()).padStart(2, '0')}`

;(async () => {
  const [{ data: invs }, { data: slots }, { data: reports }] = await Promise.all([
    supabase.from('invoices').select('brand, invoice_date, invoice_items(name, qty, scale)'),
    supabase.from('schedule_slots').select('id, brand, slot_date, durasi, tipe_live').not('host_id', 'is', null),
    supabase.from('live_reports').select('id, brand, report_date, duration_hours, slot_id'),
  ])

  const slotById = Object.fromEntries((slots || []).map(s => [s.id, s]))
  const reportTier = r => tierFromSlot(r.slot_id ? (slotById[r.slot_id] || {}).tipe_live : null)

  const kuotaRows = []
  ;(invs || []).forEach(inv => {
    if (!inv.brand) return
    ;(inv.invoice_items || []).forEach(it => {
      const h = itemQuotaHours(it)
      if (!h) return
      kuotaRows.push({ brand: inv.brand, date: inv.invoice_date, tier: tierFromItemName(it.name) || UNTAGGED, slots: h })
    })
  })

  const brands = [...new Set([
    ...kuotaRows.map(r => r.brand),
    ...(reports || []).map(r => r.brand).filter(Boolean),
  ])].sort()

  console.log(`=== Kuota per tier — ${ym} (${start} .. ${end}) ===\n`)
  brands.forEach(brand => {
    const tierNames = new Set()
    kuotaRows.forEach(r => { if (r.brand === brand) tierNames.add(r.tier) })
    ;(slots || []).forEach(s => {
      if (s.brand !== brand) return
      const t = tierFromSlot(s.tipe_live)
      if (t && s.slot_date >= start && s.slot_date <= end) tierNames.add(t)
    })
    ;(reports || []).forEach(r => {
      if (r.brand !== brand) return
      const t = reportTier(r)
      if (t) tierNames.add(t)
    })

    const rows = [...tierNames].map(tier => {
      const usedBefore = (reports || [])
        .filter(r => r.brand === brand && r.report_date < start && reportTier(r) === tier)
        .reduce((s, r) => s + (Number(r.duration_hours) || 0), 0)
      const last = kuotaRows.filter(r => r.brand === brand && r.tier === tier && r.date < start)
        .reduce((s, r) => s + r.slots, 0) - usedBefore
      const top = kuotaRows.filter(r => r.brand === brand && r.tier === tier && r.date >= start && r.date <= end)
        .reduce((s, r) => s + r.slots, 0)
      const active = (reports || [])
        .filter(r => r.brand === brand && r.report_date >= start && r.report_date <= end && reportTier(r) === tier)
        .reduce((s, r) => s + (Number(r.duration_hours) || 0), 0)
      const plan = (slots || [])
        .filter(s => s.brand === brand && s.slot_date >= start && s.slot_date <= end && tierFromSlot(s.tipe_live) === tier)
        .reduce((s, x) => s + (Number(x.durasi) > 0 ? Number(x.durasi) : 1), 0)
      return { tier, last, top, total: last + top, active, plan }
    }).filter(r => r.total !== 0 || r.active > 0 || r.plan > 0)
      .sort((a, b) => a.tier === UNTAGGED ? 1 : b.tier === UNTAGGED ? -1 : b.total - a.total)

    if (!rows.length) return
    const T = rows.reduce((a, r) => ({
      last: a.last + r.last, top: a.top + r.top, active: a.active + r.active, plan: a.plan + r.plan,
    }), { last: 0, top: 0, active: 0, plan: 0 })
    console.log(brand)
    rows.forEach(r => {
      const pct = r.total > 0 ? Math.round((r.active / r.total) * 100) + '%' : '—'
      const flag = r.total > 0 && r.active > r.total ? '  OVER' : ''
      console.log(`   ${String(r.tier).padEnd(10)} last=${String(r.last).padStart(7)}  top=+${String(r.top).padStart(5)}  total=${String(r.total).padStart(7)}  used=${String(r.active).padStart(7)}  plan=${String(r.plan).padStart(6)}  ${pct}${flag}`)
    })
    console.log(`   ${'TOTAL'.padEnd(10)} last=${String(T.last).padStart(7)}  top=+${String(T.top).padStart(5)}  total=${String(T.last + T.top).padStart(7)}  used=${String(T.active).padStart(7)}  plan=${String(T.plan).padStart(6)}`)
    console.log('')
  })
})().catch(e => { console.error(e); process.exit(1) })
