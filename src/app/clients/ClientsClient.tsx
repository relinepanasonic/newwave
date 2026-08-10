'use client'
import { useState, useEffect, useMemo } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import InvoicePanel from '@/app/invoice/InvoicePanel'
import ProductEtalasePanel from './ProductEtalasePanel'
import ServicePackagePanel from './ServicePackagePanel'
import { ChevronDown, ChevronUp, Plus, Trash2, Ban, AlertTriangle, Pencil, X } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'
import TimeInput from '@/components/TimeInput'
import { formatCurrency, PLATFORM_COLORS } from '@/lib/utils'
import { UNTAGGED, QUOTA_TIERS, itemQuotaHours, tierFromItemName, tierFromSlot, tierFromReport } from '@/lib/kuota'

type Tab = 'clients' | 'invoice' | 'servicepkg' | 'products' | 'blackout'

interface ClientProfile { id: string; full_name: string; client_brand: string }
interface LiveReportRow {
  id: string; report_date: string; brand: string | null; platform: string | null
  start_time: string | null; duration_hours: number | null
  gmv: number; impression: number; viewer: number; trans: number; comment_count: number
  hostName: string
  tier: string | null   // which Kuota bucket this session draws from (or UNTAGGED)
}
// Same shape as ClientMeter's numbers, but scoped to one live tier so a client
// who buys both Regular and Silver hours gets a separate balance for each.
interface TierMeter {
  tier: string
  lastMonthKuota: number
  topUp: number
  totalKuota: number
  activeLive: number
  planThisMonth: number
}
interface ClientMeter {
  brand: string; clientName: string
  lastMonthKuota: number   // carried-over unused Kuota balance from before the selected month
  topUp: number            // new hour-based Kuota purchased within the selected month
  totalKuota: number       // lastMonthKuota + topUp — the meter's 100% baseline
  activeLive: number       // total reported hours (sum of duration_hours) within the selected month
  planThisMonth: number    // total scheduled hours (sum of durasi) within the selected month
  tiers: TierMeter[]       // per-tier split of the same numbers (Regular/Silver/…/Untagged)
  reports: LiveReportRow[] // that brand's live reports within the selected month
  isAuto?: boolean         // surfaced from an invoice's brand, no client login/profile yet
}


// All 12 months of the current year, January through December.
function getMonthOptions() {
  const y = new Date().getFullYear()
  return Array.from({ length: 12 }, (_, m) => {
    const d = new Date(y, m, 1)
    return {
      label: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
      start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      end: `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}`,
    }
  })
}

// Severity expressed as brand-purple shade depth only (no red/amber/green):
// light = comfortably under capacity, mid = near capacity, dark = over capacity.
function severity(pct: number, exceeds: boolean): 'low' | 'mid' | 'high' {
  if (exceeds) return 'high'
  if (pct >= 80) return 'mid'
  return 'low'
}
// Hour-scaled items can divide unevenly into slots (e.g. 10h / 4h-per-sesi =
// 2.5) -- shown with one decimal instead of a misleadingly precise float.
function fmtSlots(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
function monthNameID(dateStr: string): string {
  const name = new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { month: 'long' })
  return name.charAt(0).toUpperCase() + name.slice(1)
}
function fmtDetailDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()}-${d.toLocaleDateString('en-US', { month: 'short' })}-${d.getFullYear()}`
}
const DOT_CLASSES = { low: 'bg-brand-200', mid: 'bg-brand-400', high: 'bg-brand-700' }
const BADGE_CLASSES = {
  low: 'bg-brand-50 text-brand-600', mid: 'bg-brand-100 text-brand-700', high: 'bg-brand-700 text-white',
}

function ClientListTab() {
  const { lang } = useLang()
  const [clients, setClients] = useState<ClientProfile[]>([])
  const [invoiceRows, setInvoiceRows] = useState<any[]>([])
  const [scheduleRows, setScheduleRows] = useState<any[]>([])
  const [reportRows, setReportRows] = useState<any[]>([])
  const [adjustmentRows, setAdjustmentRows] = useState<any[]>([])
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null)
  const [monthIdx, setMonthIdx] = useState(() => new Date().getMonth())
  const [loading, setLoading] = useState(true)
  // Manual Top Up adjustment modal — lets an admin move quota between
  // brands/tiers (e.g. one invoice actually covering two sibling brands)
  // without touching the synced invoice itself.
  const [adjustModal, setAdjustModal] = useState<{ brand: string; tier: string; delta: string; note: string; saving: boolean; error: string } | null>(null)
  // "Belum Terdaftar" -> Daftar Client modal: gives a brand that only exists
  // via a pushed-in invoice (no login yet) a real client account, prefilled
  // with that exact brand string so Kuota (matched by brand text) keeps
  // working unchanged once it's registered.
  const [registerModal, setRegisterModal] = useState<{ brand: string; full_name: string; email: string; password: string } | null>(null)
  const [registerSaving, setRegisterSaving] = useState(false)
  const [registerError, setRegisterError] = useState('')
  // Which brand's "Belum Ditandai" (untagged) session list is expanded — the
  // report an admin needs to know which sessions still need a Tipe Live tag.
  const [untaggedOpenBrand, setUntaggedOpenBrand] = useState<string | null>(null)
  // Bulk-tagging tool for that list: check sessions, pick a tier, apply once.
  const [selectedUntagged, setSelectedUntagged] = useState<Set<string>>(new Set())
  const [bulkTier, setBulkTier] = useState<string>(QUOTA_TIERS[0])
  const [applyingTier, setApplyingTier] = useState(false)

  async function applyTierToReports(ids: string[], tier: string) {
    if (!ids.length) return
    setApplyingTier(true)
    const supabase = createClient()
    const { error } = await supabase.from('live_reports').update({ tier_override: tier }).in('id', ids)
    if (!error) {
      const idSet = new Set(ids)
      setReportRows(prev => prev.map((r: any) => idSet.has(r.id) ? { ...r, tier_override: tier } : r))
      setSelectedUntagged(new Set())
    }
    setApplyingTier(false)
  }

  async function saveRegisterClient() {
    if (!registerModal) return
    setRegisterSaving(true); setRegisterError('')
    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registerModal.email, password: registerModal.password,
          full_name: registerModal.full_name, role: 'client',
          client_brand: registerModal.brand,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Brand text stays identical to the invoice's brand, so Kuota (matched
      // by brand string) and this row's history keep working unchanged --
      // this just swaps it from an auto-surfaced row to a real login.
      setClients(prev => [...prev, { id: data.profile.id, full_name: data.profile.full_name, client_brand: data.profile.client_brand }])
      setRegisterModal(null)
    } catch (e: any) {
      setRegisterError(e.message || 'Gagal mendaftarkan client')
    }
    setRegisterSaving(false)
  }

  const monthOptions = getMonthOptions()
  const selectedMonth = monthOptions[monthIdx]

  // Raw data is fetched once, all-time; Kuota/Active Live/plan are recomputed
  // per selected month client-side (useMemo below) so switching months doesn't refetch.
  useEffect(() => {
    const supabase = createClient()
    setLoading(true)
    Promise.all([
      supabase.from('profiles').select('id, full_name, client_brand')
        .eq('role', 'client').not('client_brand', 'is', null)
        .then(({ data }) => (data || []) as ClientProfile[]),
      supabase.from('schedule_slots')
        .select('id, brand, slot_date, session_no, durasi, tipe_live')
        .not('host_id', 'is', null)
        .order('slot_date')
        .then(({ data }) => data || []),
      supabase.from('live_reports')
        .select('id, report_date, brand, platform, start_time, duration_hours, gmv, impression, viewer, trans, comment_count, slot_id, tier_override, profiles:host_id(full_name)')
        .order('report_date')
        .then(({ data }) => data || []),
      supabase.from('invoices').select('brand, invoice_to, invoice_date, invoice_items(name, qty, scale, jam_per_sesi)')
        .order('invoice_date', { ascending: true })
        .then(({ data }) => data || []),
      supabase.from('kuota_adjustments').select('brand, tier, month_start, delta_hours, note')
        .then(({ data }) => data || []),
    ]).then(([clientsData, slots, reports, invoices, adjustments]) => {
      setClients(clientsData)
      setScheduleRows(slots as any[])
      setReportRows(reports as any[])
      setInvoiceRows(invoices as any[])
      setAdjustmentRows(adjustments as any[])
      setLoading(false)
    })
  }, [])

  function refetchAdjustments() {
    const supabase = createClient()
    supabase.from('kuota_adjustments').select('brand, tier, month_start, delta_hours, note')
      .then(({ data }) => setAdjustmentRows((data || []) as any[]))
  }

  const meters: ClientMeter[] = useMemo(() => {
    // Latest invoice_to seen per brand — used to auto-surface a client that
    // was pushed in (e.g. via ProOne) but has no registered login/profile yet.
    const invoiceToByBrand: Record<string, string> = {}
    // Per-invoice-line Kuota (hour-scaled, non-Service-Item lines only), kept
    // per invoice_date and per tier so it can be split into "before selected
    // month" vs "within selected month", and Regular vs Silver vs untiered.
    const kuotaRows: { brand: string; date: string; tier: string; slots: number }[] = []
    invoiceRows.forEach((inv: any) => {
      if (!inv.brand) return
      if (inv.invoice_to) invoiceToByBrand[inv.brand] = inv.invoice_to
      ;(inv.invoice_items || []).forEach((it: any) => {
        const hours = itemQuotaHours(it)
        if (!hours) return
        kuotaRows.push({
          brand: inv.brand, date: inv.invoice_date,
          tier: tierFromItemName(it.name) || UNTAGGED, slots: hours,
        })
      })
    })
    // Manual adjustments join the same ledger as invoice-derived top-ups, so
    // a correction made this month correctly carries forward into next
    // month's balance exactly like a real top-up would.
    adjustmentRows.forEach(a => {
      if (!a.brand || !a.delta_hours) return
      kuotaRows.push({ brand: a.brand, date: a.month_start, tier: a.tier || UNTAGGED, slots: Number(a.delta_hours) || 0 })
    })

    // Usage/plan draw from the report's own tier_override if an admin has
    // tagged it directly; otherwise from the schedule slot's Tipe Live (most
    // reports have no slot at all, since they're filed without picking one).
    // A report with neither, or a slot tagged as a non-live service, lands in
    // Untagged / is excluded from quota respectively.
    const slotById: Record<string, any> = {}
    scheduleRows.forEach((s: any) => { slotById[s.id] = s })
    const reportTier = (r: any): string | null =>
      tierFromReport(r.tier_override, r.slot_id ? slotById[r.slot_id]?.tipe_live : null)

    // Brands that show up in invoices but have no client profile/login yet —
    // surface them anyway using the invoice's own invoice_to as the display
    // name, flagged isAuto so the UI can badge them as such.
    const knownBrands = new Set(clients.map(c => c.client_brand))
    const autoBrands = new Set(kuotaRows.map(r => r.brand).filter(b => !knownBrands.has(b)))
    const autoClients: ClientProfile[] = Array.from(autoBrands)
      .map(brand => ({ id: `auto:${brand}`, full_name: invoiceToByBrand[brand] || brand, client_brand: brand }))
    const allClients = [...clients, ...autoClients]

    return allClients.map(c => {
      const brand = c.client_brand
      const reports: LiveReportRow[] = reportRows
        .filter((r: any) => r.brand === brand && r.report_date >= selectedMonth.start && r.report_date <= selectedMonth.end)
        .map((r: any) => ({
          id: r.id, report_date: r.report_date, brand: r.brand, platform: r.platform,
          start_time: r.start_time, duration_hours: r.duration_hours,
          gmv: Number(r.gmv) || 0, impression: Number(r.impression) || 0, viewer: Number(r.viewer) || 0,
          trans: Number(r.trans) || 0, comment_count: Number(r.comment_count) || 0,
          hostName: (r.profiles as any)?.full_name || '—',
          tier: reportTier(r),
        }))
        .sort((a, b) => a.report_date.localeCompare(b.report_date))

      // Per-tier split of the exact same numbers. Every tier that either bought
      // quota or consumed hours gets a row, so an over-run on Silver stays
      // visible even when the pooled total still looks healthy.
      const tierNames = new Set<string>()
      kuotaRows.forEach(r => { if (r.brand === brand) tierNames.add(r.tier) })
      scheduleRows.forEach((s: any) => {
        if (s.brand !== brand) return
        const t = tierFromSlot(s.tipe_live)
        if (t && s.slot_date >= selectedMonth.start && s.slot_date <= selectedMonth.end) tierNames.add(t)
      })
      reportRows.forEach((r: any) => {
        if (r.brand !== brand) return
        const t = reportTier(r)
        if (t) tierNames.add(t)
      })
      // (kuotaRows already includes adjustmentRows, so a tier that only has a
      // manual adjustment and no invoice/live activity still gets a row.)

      const tiers: TierMeter[] = Array.from(tierNames).map(tier => {
        const usedBefore = reportRows
          .filter((r: any) => r.brand === brand && r.report_date < selectedMonth.start && reportTier(r) === tier)
          .reduce((s: number, r: any) => s + (Number(r.duration_hours) || 0), 0)
        const tLastMonth = kuotaRows
          .filter(r => r.brand === brand && r.tier === tier && r.date < selectedMonth.start)
          .reduce((s, r) => s + r.slots, 0) - usedBefore
        const tTopUp = kuotaRows
          .filter(r => r.brand === brand && r.tier === tier && r.date >= selectedMonth.start && r.date <= selectedMonth.end)
          .reduce((s, r) => s + r.slots, 0)
        const tActive = reportRows
          .filter((r: any) => r.brand === brand && r.report_date >= selectedMonth.start && r.report_date <= selectedMonth.end && reportTier(r) === tier)
          .reduce((s: number, r: any) => s + (Number(r.duration_hours) || 0), 0)
        const tPlan = scheduleRows
          .filter((s: any) => s.brand === brand && s.slot_date >= selectedMonth.start && s.slot_date <= selectedMonth.end && tierFromSlot(s.tipe_live) === tier)
          .reduce((s: number, x: any) => s + (Number(x.durasi) > 0 ? Number(x.durasi) : 1), 0)
        return { tier, lastMonthKuota: tLastMonth, topUp: tTopUp, totalKuota: tLastMonth + tTopUp, activeLive: tActive, planThisMonth: tPlan }
      })
      // Real tiers first (highest quota first), Untagged always last.
      .sort((a, b) => {
        if (a.tier === UNTAGGED) return 1
        if (b.tier === UNTAGGED) return -1
        return b.totalKuota - a.totalKuota
      })
      .filter(t => t.totalKuota !== 0 || t.activeLive > 0 || t.planThisMonth > 0)

      // Headline numbers are the sum of the tier rows, so the summary line can
      // never disagree with the breakdown underneath it.
      const sum = (pick: (t: TierMeter) => number) => tiers.reduce((s, t) => s + pick(t), 0)
      const lastMonthKuota = sum(t => t.lastMonthKuota)
      const topUp = sum(t => t.topUp)

      return {
        brand, clientName: c.full_name,
        lastMonthKuota, topUp,
        totalKuota: lastMonthKuota + topUp,
        activeLive: sum(t => t.activeLive),
        planThisMonth: sum(t => t.planThisMonth),
        reports, tiers,
        isAuto: c.id.startsWith('auto:'),
      }
    })
  }, [clients, invoiceRows, scheduleRows, reportRows, adjustmentRows, selectedMonth.start, selectedMonth.end])

  // Hide clients with nothing going on in the selected month -- no Kuota
  // balance to work with and no live activity (reported or scheduled).
  const visibleMeters = useMemo(() =>
    meters.filter(m => m.totalKuota > 0 || m.activeLive > 0 || m.planThisMonth > 0),
    [meters])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">{lang === 'id' ? 'Client List' : 'Client List'}</h2>
          <p className="text-sm text-gray-500">{visibleMeters.length} {lang === 'id' ? 'client aktif bulan ini' : 'clients active this month'}</p>
        </div>
        <select value={monthIdx} onChange={e => setMonthIdx(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
          {monthOptions.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
        </select>
      </div>

      {/* Column headers */}
      {!loading && visibleMeters.length > 0 && (
        <div className="hidden sm:flex items-center gap-4 px-4 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
          <span className="flex-1">Client Name</span>
          <span className="w-32 text-right">Active Live</span>
          <span className="w-32 text-right">Last Month</span>
          <span className="w-28 mr-8 text-right">Top Up</span>
          <span className="w-56">Meter</span>
          <span className="w-14 text-right">%</span>
          <span className="w-4"></span>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-14 animate-pulse"/>)}
        </div>
      ) : visibleMeters.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <p className="text-sm font-medium text-gray-400">Tidak ada client dengan aktivitas di bulan ini</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
          {visibleMeters.map(m => {
            const hasKuota = m.totalKuota > 0
            const pct = hasKuota ? Math.round((m.activeLive / m.totalKuota) * 100) : 0
            const exceeds = m.activeLive > m.totalKuota
            const sev = severity(pct, exceeds)
            const isExpanded = expandedBrand === m.brand
            const canExpand = m.reports.length > 0 || m.tiers.length > 0
            const planPct = hasKuota ? Math.min((m.planThisMonth / m.totalKuota) * 100, 100) : 0
            const succeedPct = hasKuota ? Math.min((m.activeLive / m.totalKuota) * 100, 100) : 0
            return (
              <div key={m.brand}>
                <div
                  onClick={() => canExpand && setExpandedBrand(isExpanded ? null : m.brand)}
                  className={`flex items-center gap-4 px-4 py-3.5 ${canExpand ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_CLASSES[sev]}`}/>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate flex items-center gap-1.5">
                      {m.brand}
                      {m.isAuto && (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setRegisterError('')
                            setRegisterModal({ brand: m.brand, full_name: m.clientName, email: '', password: '' })
                          }}
                          title="Muncul dari invoice, belum punya akun login — klik untuk daftarkan"
                          className="text-[9px] bg-amber-100 text-amber-700 hover:bg-amber-200 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap transition-colors">
                          Belum Terdaftar · Daftarkan
                        </button>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{m.clientName}</p>
                  </div>
                  <span className="w-32 text-right text-sm font-semibold text-gray-800 tabular-nums flex-shrink-0">
                    {fmtSlots(m.activeLive)}
                  </span>
                  <span className="w-32 text-right text-sm text-gray-600 tabular-nums flex-shrink-0">
                    {fmtSlots(m.lastMonthKuota)}
                  </span>
                  <span className="w-28 mr-8 text-right text-sm text-gray-600 tabular-nums flex-shrink-0">
                    {m.topUp > 0 ? `+${fmtSlots(m.topUp)}` : '—'}
                  </span>
                  {/* 3-layer meter: background = total Kuota, light purple = plan this month, dark purple = succeed (reported) */}
                  <div className="w-56 flex-shrink-0">
                    <div className="relative h-2.5 bg-white border border-gray-200 rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-brand-200 rounded-full transition-all duration-500"
                        style={{ width: hasKuota ? `${planPct}%` : '0%' }}/>
                      <div className="absolute inset-y-0 left-0 bg-brand-600 rounded-full transition-all duration-500"
                        style={{ width: hasKuota ? `${succeedPct}%` : '0%' }}/>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 tabular-nums">
                      {hasKuota ? `${fmtSlots(m.activeLive)} / ${fmtSlots(m.totalKuota)}` : '— Kuota'}
                    </p>
                  </div>
                  <span className="w-14 flex justify-end flex-shrink-0">
                    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-bold px-2 py-0.5 rounded-full ${BADGE_CLASSES[sev]}`}>
                      {sev === 'high' && <AlertTriangle size={9}/>}
                      {hasKuota ? `${pct}%` : '—'}
                    </span>
                  </span>
                  {canExpand ? (
                    isExpanded ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0"/> : <ChevronDown size={14} className="text-gray-400 flex-shrink-0"/>
                  ) : <span className="w-3.5 flex-shrink-0"/>}
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4">
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2 pl-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Kuota per Tipe Live
                        </p>
                        <button
                          onClick={() => {
                            const existingTiers = new Set(m.tiers.map(t => t.tier))
                            const defaultTier = QUOTA_TIERS.find(t => !existingTiers.has(t)) || QUOTA_TIERS[0]
                            const existing = adjustmentRows.find(a => a.brand === m.brand && (a.tier || UNTAGGED) === defaultTier && a.month_start === selectedMonth.start)
                            setAdjustModal({ brand: m.brand, tier: defaultTier, delta: existing ? String(existing.delta_hours) : '', note: existing?.note || '', saving: false, error: '' })
                          }}
                          className="flex items-center gap-1 text-[10px] font-semibold text-brand-600 hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-brand-50">
                          <Plus size={11}/> Sesuaikan Top Up
                        </button>
                      </div>
                      {m.tiers.length > 0 && (
                        <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
                          {m.tiers.map(t => {
                            const tHas = t.totalKuota > 0
                            const tPct = tHas ? Math.round((t.activeLive / t.totalKuota) * 100) : 0
                            const tSev = severity(tPct, t.activeLive > t.totalKuota)
                            const tPlanPct = tHas ? Math.min((t.planThisMonth / t.totalKuota) * 100, 100) : 0
                            const tDonePct = tHas ? Math.min((t.activeLive / t.totalKuota) * 100, 100) : 0
                            const isUntagged = t.tier === UNTAGGED
                            // Badge sits at a fixed width right next to its Active
                            // Live number (no flex-1 gap between them), and every
                            // tier row shares the same column widths so Regular's
                            // numbers stack tidily above Silver's / Untagged's.
                            return (
                              <div key={t.tier} className="flex items-center gap-3 px-4 py-2.5">
                                <div className="w-28 flex-shrink-0">
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                    isUntagged ? 'bg-amber-100 text-amber-700' : 'bg-brand-50 text-brand-700'
                                  }`}>
                                    {isUntagged ? 'Belum Ditandai' : t.tier}
                                  </span>
                                </div>
                                <span className="w-16 text-right text-xs font-semibold text-gray-800 tabular-nums flex-shrink-0">
                                  {fmtSlots(t.activeLive)}
                                </span>
                                <span className="w-16 text-right text-xs text-gray-500 tabular-nums flex-shrink-0">
                                  {fmtSlots(t.lastMonthKuota)}
                                </span>
                                <span className="w-20 text-right text-xs text-gray-500 tabular-nums flex-shrink-0 flex items-center justify-end gap-1">
                                  {t.topUp > 0 ? `+${fmtSlots(t.topUp)}` : '—'}
                                  <button
                                    onClick={() => {
                                      const existing = adjustmentRows.find(a => a.brand === m.brand && (a.tier || UNTAGGED) === t.tier && a.month_start === selectedMonth.start)
                                      setAdjustModal({ brand: m.brand, tier: t.tier, delta: existing ? String(existing.delta_hours) : '', note: existing?.note || '', saving: false, error: '' })
                                    }}
                                    className="text-gray-300 hover:text-brand-600 flex-shrink-0" title="Sesuaikan Top Up">
                                    <Pencil size={10}/>
                                  </button>
                                </span>
                                <div className="flex-1 min-w-[100px]">
                                  <div className="relative h-2 bg-white border border-gray-200 rounded-full overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 bg-brand-200 rounded-full" style={{ width: `${tPlanPct}%` }}/>
                                    <div className="absolute inset-y-0 left-0 bg-brand-600 rounded-full" style={{ width: `${tDonePct}%` }}/>
                                  </div>
                                  <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                                    {tHas ? `${fmtSlots(t.activeLive)} / ${fmtSlots(t.totalKuota)}` : `${fmtSlots(t.activeLive)} jam · tanpa kuota`}
                                  </p>
                                </div>
                                <span className={`w-12 text-right text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${BADGE_CLASSES[tSev]}`}>
                                  {tHas ? `${tPct}%` : '—'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {m.tiers.some(t => t.tier === UNTAGGED) && (() => {
                        const untaggedReports = m.reports.filter(r => r.tier === UNTAGGED)
                        const isOpen = untaggedOpenBrand === m.brand
                        const hostCounts: Record<string, { ids: string[]; hours: number }> = {}
                        untaggedReports.forEach(r => {
                          const h = (hostCounts[r.hostName] ||= { ids: [], hours: 0 })
                          h.ids.push(r.id); h.hours += Number(r.duration_hours) || 0
                        })
                        const allChecked = untaggedReports.length > 0 && untaggedReports.every(r => selectedUntagged.has(r.id))
                        return (
                          <div className="mt-1.5 pl-1">
                            <p className="text-[10px] text-amber-600 leading-relaxed">
                              &ldquo;Belum Ditandai&rdquo; = jam live yang belum ditandai Tipe Live-nya (kebanyakan tidak terhubung ke slot Schedule sama sekali, jadi tidak bisa diedit lewat Schedule).
                              Angka minus di sini berarti jam terpakai yang belum ketahuan tipenya — bukan kuota minus. Total di baris atas tetap benar.
                              Gunakan tool di bawah untuk menandai langsung dari sini.
                            </p>
                            <button
                              onClick={() => { setUntaggedOpenBrand(isOpen ? null : m.brand); setSelectedUntagged(new Set()) }}
                              className="text-[10px] font-semibold text-amber-700 hover:text-amber-800 underline mt-1">
                              {isOpen ? 'Sembunyikan tool penandaan' : `Tandai sesi Belum Ditandai (${untaggedReports.length})`}
                            </button>
                            {isOpen && (
                              <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/60 overflow-hidden">
                                {/* Per-host shortcut: one click selects every untagged session for that host */}
                                <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-amber-100">
                                  {Object.entries(hostCounts).map(([host, v]) => (
                                    <button key={host}
                                      onClick={() => setSelectedUntagged(prev => {
                                        const allIn = v.ids.every(id => prev.has(id))
                                        const next = new Set(prev)
                                        v.ids.forEach(id => allIn ? next.delete(id) : next.add(id))
                                        return next
                                      })}
                                      className={`text-[10px] font-medium px-2 py-1 rounded-full border transition-colors ${
                                        v.ids.every(id => selectedUntagged.has(id))
                                          ? 'bg-brand-600 border-brand-600 text-white'
                                          : 'bg-white border-amber-200 text-amber-700 hover:border-brand-300'
                                      }`}>
                                      {host} · {v.ids.length} sesi · {fmtSlots(v.hours)}j
                                    </button>
                                  ))}
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-[10px] text-amber-700 uppercase tracking-wide">
                                      <th className="px-3 py-1.5 text-left font-semibold w-8">
                                        <input type="checkbox" checked={allChecked}
                                          onChange={() => setSelectedUntagged(allChecked ? new Set() : new Set(untaggedReports.map(r => r.id)))}/>
                                      </th>
                                      <th className="px-3 py-1.5 text-left font-semibold">Tanggal</th>
                                      <th className="px-3 py-1.5 text-left font-semibold">Host</th>
                                      <th className="px-3 py-1.5 text-left font-semibold">Platform</th>
                                      <th className="px-3 py-1.5 text-right font-semibold">Jam</th>
                                      <th className="px-3 py-1.5 text-left font-semibold">Tipe Live</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-amber-100">
                                    {untaggedReports.map(r => (
                                      <tr key={r.id} className={selectedUntagged.has(r.id) ? 'bg-brand-50/60' : ''}>
                                        <td className="px-3 py-1.5">
                                          <input type="checkbox" checked={selectedUntagged.has(r.id)}
                                            onChange={() => setSelectedUntagged(prev => {
                                              const next = new Set(prev)
                                              next.has(r.id) ? next.delete(r.id) : next.add(r.id)
                                              return next
                                            })}/>
                                        </td>
                                        <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{fmtDetailDate(r.report_date)}</td>
                                        <td className="px-3 py-1.5 text-gray-700">{r.hostName}</td>
                                        <td className="px-3 py-1.5 text-gray-700">{r.platform || '—'}</td>
                                        <td className="px-3 py-1.5 text-right text-gray-700 tabular-nums">{r.duration_hours ?? '—'}</td>
                                        <td className="px-3 py-1.5">
                                          <select
                                            defaultValue=""
                                            onChange={e => { if (e.target.value) applyTierToReports([r.id], e.target.value) }}
                                            disabled={applyingTier}
                                            className="text-[10px] border border-amber-200 rounded-lg px-1.5 py-0.5 bg-white disabled:opacity-50">
                                            <option value="" disabled>Pilih…</option>
                                            {QUOTA_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                                          </select>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <div className="flex items-center gap-2 px-3 py-2 border-t border-amber-100 bg-amber-50">
                                  <span className="text-[10px] text-amber-700 font-medium">
                                    {selectedUntagged.size > 0 ? `${selectedUntagged.size} sesi dipilih` : 'Pilih sesi untuk menandai massal'}
                                  </span>
                                  <select value={bulkTier} onChange={e => setBulkTier(e.target.value)}
                                    disabled={selectedUntagged.size === 0 || applyingTier}
                                    className="ml-auto text-[10px] border border-amber-200 rounded-lg px-2 py-1 bg-white disabled:opacity-50">
                                    {QUOTA_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                  <button
                                    onClick={() => applyTierToReports(Array.from(selectedUntagged), bulkTier)}
                                    disabled={selectedUntagged.size === 0 || applyingTier}
                                    className="text-[10px] font-semibold bg-brand-600 text-white px-3 py-1 rounded-lg hover:bg-brand-700 disabled:opacity-40">
                                    {applyingTier ? 'Menerapkan…' : `Tandai sebagai ${bulkTier}`}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 pl-1">
                      Live {selectedMonth.label}
                    </p>
                    <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-gray-100 bg-white">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0">
                          <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide text-[10px]">
                            <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Bulan</th>
                            <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Tanggal</th>
                            <th className="px-3 py-2 text-left font-semibold">Brand</th>
                            <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Start Sesi</th>
                            <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Total Jam</th>
                            <th className="px-3 py-2 text-left font-semibold">Host</th>
                            <th className="px-3 py-2 text-left font-semibold">Platform</th>
                            <th className="px-3 py-2 text-right font-semibold">GMV</th>
                            <th className="px-3 py-2 text-right font-semibold">Impression</th>
                            <th className="px-3 py-2 text-right font-semibold">Viewer</th>
                            <th className="px-3 py-2 text-right font-semibold">Trans</th>
                            <th className="px-3 py-2 text-right font-semibold">Comment</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {m.reports.map(r => (
                            <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{monthNameID(r.report_date)}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDetailDate(r.report_date)}</td>
                              <td className="px-3 py-2 font-medium text-gray-800 max-w-[140px] truncate">{r.brand || '—'}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.start_time ? r.start_time.slice(0, 5).replace(':', '.') : '—'}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{r.duration_hours ?? '—'}</td>
                              <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{r.hostName}</td>
                              <td className="px-3 py-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${PLATFORM_COLORS[r.platform || ''] || PLATFORM_COLORS.Other}`}>
                                  {r.platform || '—'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{formatCurrency(r.gmv)}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{r.impression.toLocaleString('id-ID')}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{r.viewer.toLocaleString('id-ID')}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{r.trans.toLocaleString('id-ID')}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{r.comment_count.toLocaleString('id-ID')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Daftarkan Client modal — gives a "Belum Terdaftar" (invoice-only)
          brand a real login. Brand stays exactly as-is so Kuota (matched by
          brand text against the invoice already on file) keeps working. */}
      {registerModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !registerSaving && setRegisterModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-bold text-gray-900">Daftarkan Client</h3>
              <button onClick={() => setRegisterModal(null)}><X size={16} className="text-gray-400"/></button>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Membuat login untuk <span className="font-semibold text-gray-600">{registerModal.brand}</span> — invoice yang sudah ada tetap terhubung otomatis, termasuk Kuota-nya.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Email</label>
                <input type="email" value={registerModal.email}
                  onChange={e => setRegisterModal(m => m && { ...m, email: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" placeholder="email@brand.com"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Password</label>
                <input type="password" value={registerModal.password}
                  onChange={e => setRegisterModal(m => m && { ...m, password: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" placeholder="Min 6 karakter"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Nama</label>
                <input value={registerModal.full_name}
                  onChange={e => setRegisterModal(m => m && { ...m, full_name: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Brand</label>
                <input value={registerModal.brand} disabled
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-500"/>
              </div>
              {registerError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{registerError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setRegisterModal(null)} disabled={registerSaving}
                className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">Batal</button>
              <button onClick={saveRegisterClient} disabled={registerSaving || !registerModal.email || !registerModal.password || !registerModal.full_name}
                className="flex-1 bg-brand-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-60">
                {registerSaving ? 'Mendaftarkan...' : 'Daftarkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sesuaikan Top Up modal — moves quota between brands/tiers (e.g. one
          invoice actually covering two sibling brands) without touching the
          synced invoice itself. */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !adjustModal.saving && setAdjustModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-gray-900 text-sm">Sesuaikan Top Up</h3>
              <button onClick={() => setAdjustModal(null)} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={16} className="text-gray-400"/>
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">{adjustModal.brand} — {selectedMonth.label}</p>

            <label className="block text-xs font-medium text-gray-500 mb-1">Tipe Live</label>
            <select value={adjustModal.tier}
              onChange={e => {
                const tier = e.target.value
                const existing = adjustmentRows.find(a => a.brand === adjustModal.brand && (a.tier || UNTAGGED) === tier && a.month_start === selectedMonth.start)
                setAdjustModal(m => m && { ...m, tier, delta: existing ? String(existing.delta_hours) : '', note: existing?.note || '' })
              }}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
              {[...QUOTA_TIERS, UNTAGGED].map(t => <option key={t} value={t}>{t === UNTAGGED ? 'Belum Ditandai' : t}</option>)}
            </select>

            <label className="block text-xs font-medium text-gray-500 mb-1">
              Penyesuaian Top Up ({selectedMonth.label}), jam — boleh minus
            </label>
            <input type="number" step="0.5" value={adjustModal.delta}
              onChange={e => setAdjustModal(m => m && { ...m, delta: e.target.value })}
              placeholder="mis. -50 atau 50"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-brand-400"/>
            <p className="text-[11px] text-gray-400 mb-3 -mt-2">
              Nilai ini ditambahkan ke Top Up dari invoice bulan ini. Isi 0 atau kosongkan untuk menghapus penyesuaian.
              Contoh: pindahkan 50 jam Regular dari Niko Electronic ke Numan &rarr; isi -50 di Niko, +50 di Numan.
            </p>

            <label className="block text-xs font-medium text-gray-500 mb-1">Catatan (opsional)</label>
            <input type="text" value={adjustModal.note}
              onChange={e => setAdjustModal(m => m && { ...m, note: e.target.value })}
              placeholder="mis. 1 invoice Niko dibagi ke Numan"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-1 focus:outline-none focus:ring-2 focus:ring-brand-400"/>

            {adjustModal.error && <p className="text-xs text-red-600 mt-2">{adjustModal.error}</p>}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setAdjustModal(null)} disabled={adjustModal.saving}
                className="flex-1 text-sm border border-gray-200 text-gray-600 rounded-xl px-3 py-2 hover:bg-gray-50 disabled:opacity-50">
                Batal
              </button>
              <button
                onClick={async () => {
                  if (!adjustModal) return
                  const delta = Number(adjustModal.delta)
                  if (adjustModal.delta.trim() !== '' && Number.isNaN(delta)) {
                    setAdjustModal(m => m && { ...m, error: 'Jam harus berupa angka' }); return
                  }
                  setAdjustModal(m => m && { ...m, saving: true, error: '' })
                  const supabase = createClient()
                  const { data: { user } } = await supabase.auth.getUser()
                  const monthStart = selectedMonth.start
                  if (!delta) {
                    // 0/blank -> remove any existing adjustment for this cell.
                    const { error } = await supabase.from('kuota_adjustments').delete()
                      .match({ brand: adjustModal.brand, tier: adjustModal.tier, month_start: monthStart })
                    if (error) { setAdjustModal(m => m && { ...m, saving: false, error: error.message }); return }
                  } else {
                    const { error } = await supabase.from('kuota_adjustments')
                      .upsert({
                        brand: adjustModal.brand, tier: adjustModal.tier, month_start: monthStart,
                        delta_hours: delta, note: adjustModal.note || null, created_by: user?.id || null,
                      }, { onConflict: 'brand,tier,month_start' })
                    if (error) { setAdjustModal(m => m && { ...m, saving: false, error: error.message }); return }
                  }
                  refetchAdjustments()
                  setAdjustModal(null)
                }}
                disabled={adjustModal.saving}
                className="flex-1 text-sm bg-brand-600 text-white rounded-xl px-3 py-2 hover:bg-brand-700 disabled:opacity-50">
                {adjustModal.saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Blackout Hours Management ─────────────────────────────────────────────────
const PLATFORMS_BO = ['Shopee', 'TikTok', 'Instagram', 'YouTube', 'Other']
const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

interface Blackout {
  id: string; brand: string; platform: string | null
  day_of_week: number[] | null; start_time: string; end_time: string; reason: string | null
}

function BlackoutTab() {
  const { lang } = useLang()
  const [brands, setBrands] = useState<string[]>([])
  const [rules, setRules] = useState<Blackout[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({
    brand: '', platform: '', startTime: '', endTime: '', reason: '', everyday: true, days: [] as number[],
  })

  async function load() {
    const supabase = createClient()
    const [{ data: clients }, { data: bos }] = await Promise.all([
      supabase.from('profiles').select('client_brand').eq('role', 'client').not('client_brand', 'is', null),
      supabase.from('client_blackouts').select('*').order('brand').order('start_time'),
    ])
    setBrands((clients || []).map((c: any) => c.client_brand).filter(Boolean).sort())
    setRules(bos || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function addRule() {
    setErr('')
    if (!form.brand) { setErr('Pilih brand'); return }
    if (!form.startTime || !form.endTime) { setErr('Jam mulai dan selesai wajib diisi'); return }
    if (form.startTime >= form.endTime) { setErr('Jam selesai harus setelah jam mulai'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('client_blackouts').insert({
      brand: form.brand,
      platform: form.platform || null,
      day_of_week: form.everyday ? null : (form.days.length ? form.days : null),
      start_time: form.startTime,
      end_time: form.endTime,
      reason: form.reason || null,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowForm(false)
    setForm({ brand: '', platform: '', startTime: '', endTime: '', reason: '', everyday: true, days: [] })
    load()
  }

  async function deleteRule(id: string) {
    if (!confirm('Hapus aturan ini?')) return
    const supabase = createClient()
    await supabase.from('client_blackouts').delete().eq('id', id)
    setRules(prev => prev.filter(r => r.id !== id))
  }

  function toggleDay(d: number) {
    setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] }))
  }

  function fmtTime(t: string) { return t.slice(0, 5) }
  function fmtDays(dow: number[] | null) {
    if (!dow || dow.length === 0) return 'Setiap hari'
    return dow.sort((a, b) => a - b).map(d => DAY_LABELS[d]).join(', ')
  }

  const grouped = brands.map(b => ({ brand: b, rules: rules.filter(r => r.brand === b) }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">{tr('blackoutTitle', lang)}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{tr('blackoutDesc', lang)}</p>
        </div>
        <button onClick={() => { setShowForm(s => !s); setErr('') }}
          className="flex items-center gap-1.5 bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-brand-700 transition-colors">
          <Plus size={15}/> Tambah Aturan
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white border border-brand-200 rounded-2xl p-5 shadow-sm space-y-4">
          <p className="text-sm font-bold text-gray-800">Aturan Baru</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Brand</label>
              <select value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-400">
                <option value="">— Pilih brand —</option>
                {brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Platform</label>
              <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-400">
                <option value="">Semua Platform</option>
                {PLATFORMS_BO.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Jam Mulai</label>
              <TimeInput value={form.startTime} onChange={v => setForm(f => ({ ...f, startTime: v }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-400"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Jam Selesai</label>
              <TimeInput value={form.endTime} onChange={v => setForm(f => ({ ...f, endTime: v }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-400"/>
            </div>
          </div>

          {/* Day selector */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Hari</label>
            <div className="flex flex-wrap gap-2 items-center">
              <button type="button" onClick={() => setForm(f => ({ ...f, everyday: true, days: [] }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  form.everyday ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-brand-400'}`}>
                Setiap Hari
              </button>
              <span className="text-gray-300 text-xs">atau</span>
              {DAY_LABELS.map((label, i) => (
                <button key={i} type="button"
                  onClick={() => { setForm(f => ({ ...f, everyday: false })); toggleDay(i) }}
                  className={`w-9 h-9 rounded-lg text-xs font-semibold border transition-colors ${
                    !form.everyday && form.days.includes(i)
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-brand-400'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Alasan (opsional)</label>
            <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Live internal, Agency lain"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-400"/>
          </div>

          {err && <p className="text-xs text-red-600 font-medium">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50">Batal</button>
            <button type="button" onClick={addRule} disabled={saving}
              className="flex-1 bg-brand-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-60">
              {saving ? 'Menyimpan...' : 'Simpan Aturan'}
            </button>
          </div>
        </div>
      )}

      {/* Rules grouped by brand */}
      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse"/>)}</div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400">Belum ada client terdaftar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ brand, rules: bRules }) => (
            <div key={brand} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <p className="font-bold text-gray-800 text-sm">{brand}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  bRules.length > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>
                  {bRules.length > 0 ? `${bRules.length} blokir` : 'Bebas'}
                </span>
              </div>
              {bRules.length === 0 ? (
                <p className="px-4 py-3 text-xs text-gray-400 italic">Tidak ada aturan blokir untuk brand ini</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {bRules.map(r => (
                    <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Ban size={14} className="text-red-500"/>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800">
                            {fmtTime(r.start_time)} – {fmtTime(r.end_time)}
                            <span className="ml-2 text-xs font-normal text-gray-500">
                              {r.platform || 'Semua Platform'}
                            </span>
                          </p>
                          <p className="text-xs text-gray-400">
                            {fmtDays(r.day_of_week)}{r.reason ? ` · ${r.reason}` : ''}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => deleteRule(r.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ClientsClient({ profile }: { profile: any }) {
  const { lang } = useLang()
  const [tab, setTab] = useState<Tab>('clients')

  return (
    <AppShell role="superadmin" userName={profile.full_name}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">{tr('clients', lang)}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tr('clientsDesc', lang)}</p>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 flex-wrap">
          {(['clients', 'invoice', 'servicepkg', 'products', 'blackout'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'clients' ? (lang === 'id' ? 'Client List' : 'Clients')
                : t === 'invoice' ? 'Invoice'
                : t === 'servicepkg' ? 'NW Service Package'
                : t === 'products' ? (lang === 'id' ? 'Product Etalase' : 'Products')
                : tr('blackoutTitle', lang)}
            </button>
          ))}
        </div>

        {tab === 'clients' ? <ClientListTab/>
          : tab === 'invoice' ? <InvoicePanel profile={profile}/>
          : tab === 'servicepkg' ? <ServicePackagePanel/>
          : tab === 'products' ? <ProductEtalasePanel profile={profile}/>
          : <BlackoutTab/>}
      </div>
    </AppShell>
  )
}
