'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import InvoicePanel from '@/app/invoice/InvoicePanel'
import ProductEtalasePanel from './ProductEtalasePanel'
import ServicePackagePanel from './ServicePackagePanel'
import { ChevronDown, ChevronUp, Plus, Trash2, Ban } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'
import TimeInput from '@/components/TimeInput'

type Tab = 'clients' | 'invoice' | 'servicepkg' | 'products' | 'blackout'

interface ClientProfile { id: string; full_name: string; client_brand: string }
interface PackageCapacity {
  tipe: string    // e.g. "Regular", "Silver"
  slots: number   // purchased slot count
  hours: number   // purchased hours
  jam_per_sesi: number
  planSlots: number  // how many scheduled slots carry this tipe_live
}
interface ClientMeter {
  brand: string; clientName: string
  capacityHours: number   // total slot hours purchased (from invoices)
  capacitySlots: number   // total slots (sessions) purchased
  planHours: number       // total scheduled live hours
  planSlots: number       // total scheduled sessions
  successHours: number    // scheduled hours that already have a live report
  successSlots: number    // scheduled sessions with a live report
  packages: PackageCapacity[]  // per-package breakdown from invoice items
}

// Trim trailing .0 → "150" not "150.0", keep "12.5"
function trimH(n: number) { return Number(n.toFixed(1)).toString() }

function getMonthOptions() {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    const y = d.getFullYear(); const m = d.getMonth()
    return {
      label: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
      start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      end: `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}`,
    }
  })
}

interface ReportMemo { id: string; slot_date: string; notes: string; memo_checked: boolean }

function ClientListTab() {
  const { lang } = useLang()
  const [meters, setMeters] = useState<ClientMeter[]>([])
  const [scheduleByBrand, setScheduleByBrand] = useState<Record<string, any[]>>({})
  const [memosByBrand, setMemosByBrand] = useState<Record<string, ReportMemo[]>>({})
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null)
  const [monthIdx, setMonthIdx] = useState(0)
  const [loading, setLoading] = useState(true)

  const monthOptions = getMonthOptions()
  const selectedMonth = monthOptions[monthIdx]

  // Capacity (slot purchased) and usage are cumulative balances → fetched all-time,
  // independent of the month dropdown (which only scopes the jadwal table below).
  useEffect(() => {
    const supabase = createClient()
    setLoading(true)
    Promise.all([
      supabase.from('profiles').select('id, full_name, client_brand')
        .eq('role', 'client').not('client_brand', 'is', null)
        .then(({ data }) => (data || []) as ClientProfile[]),
      supabase.from('schedule_slots')
        .select('id, brand, slot_date, session_no, durasi, tipe_live, profiles:host_id(full_name)')
        .not('host_id', 'is', null)
        .order('slot_date')
        .then(({ data }) => data || []),
      supabase.from('live_reports').select('id, slot_id, brand, notes, memo_checked, slot_date')
        .not('notes', 'is', null).order('slot_date', { ascending: false })
        .then(({ data }) => data || []),
      supabase.from('invoices').select('brand, invoice_items(tipe_live, jam_per_sesi, qty)')
        .then(({ data }) => data || []),
    ]).then(([clients, slots, reports, invoices]) => {
      // Capacity per brand from invoice items — also track per package type
      const capacityByBrand: Record<string, number> = {}
      const capacitySlotsByBrand: Record<string, number> = {}
      // packages: brand → tipe → { slots, hours, jam_per_sesi }
      const pkgByBrand: Record<string, Record<string, { slots: number; hours: number; jam_per_sesi: number }>> = {}
      ;(invoices as any[]).forEach((inv: any) => {
        if (!inv.brand) return
        const hrs = (inv.invoice_items || []).reduce(
          (s: number, it: any) => s + (Number(it.jam_per_sesi) || 0) * (Number(it.qty) || 0), 0)
        const slotsCount = (inv.invoice_items || []).reduce(
          (s: number, it: any) => s + (Number(it.qty) || 0), 0)
        capacityByBrand[inv.brand] = (capacityByBrand[inv.brand] || 0) + hrs
        capacitySlotsByBrand[inv.brand] = (capacitySlotsByBrand[inv.brand] || 0) + slotsCount
        // Per-package breakdown
        if (!pkgByBrand[inv.brand]) pkgByBrand[inv.brand] = {}
        ;(inv.invoice_items || []).forEach((it: any) => {
          const tipe = it.tipe_live || 'Regular'
          const jps = Number(it.jam_per_sesi) || 0
          const qty = Number(it.qty) || 0
          if (!pkgByBrand[inv.brand][tipe]) pkgByBrand[inv.brand][tipe] = { slots: 0, hours: 0, jam_per_sesi: jps }
          pkgByBrand[inv.brand][tipe].slots += qty
          pkgByBrand[inv.brand][tipe].hours += jps * qty
          if (jps > 0) pkgByBrand[inv.brand][tipe].jam_per_sesi = jps  // keep last non-zero value
        })
      })

      // Which slots already have a live report (success)
      const reportedSlotIds = new Set(
        (reports as any[]).map((r: any) => r.slot_id).filter(Boolean))

      // Memos per brand (live report notes shown as client checklist)
      const memoMap: Record<string, ReportMemo[]> = {}
      ;(reports as any[]).forEach((r: any) => {
        if (!r.brand || !r.notes?.trim()) return
        if (!memoMap[r.brand]) memoMap[r.brand] = []
        memoMap[r.brand].push({ id: r.id, slot_date: r.slot_date || '', notes: r.notes, memo_checked: !!r.memo_checked })
      })
      setMemosByBrand(memoMap)

      const planByBrand: Record<string, number> = {}
      const planSlotsByBrand: Record<string, number> = {}
      const successByBrand: Record<string, number> = {}
      const successSlotsByBrand: Record<string, number> = {}
      // per-package plan slots: brand → tipe → count
      const planSlotsByBrandPkg: Record<string, Record<string, number>> = {}
      const scheduleMap: Record<string, any[]> = {}
      ;(slots as any[]).forEach((s: any) => {
        if (!s.brand) return
        const dur = Number(s.durasi) || 1
        planByBrand[s.brand] = (planByBrand[s.brand] || 0) + dur
        planSlotsByBrand[s.brand] = (planSlotsByBrand[s.brand] || 0) + 1
        // per-package plan tracking (tipe_live on slot)
        const slotTipe = s.tipe_live || ''
        if (slotTipe) {
          if (!planSlotsByBrandPkg[s.brand]) planSlotsByBrandPkg[s.brand] = {}
          planSlotsByBrandPkg[s.brand][slotTipe] = (planSlotsByBrandPkg[s.brand][slotTipe] || 0) + 1
        }
        if (reportedSlotIds.has(s.id)) {
          successByBrand[s.brand] = (successByBrand[s.brand] || 0) + dur
          successSlotsByBrand[s.brand] = (successSlotsByBrand[s.brand] || 0) + 1
        }
        if (!scheduleMap[s.brand]) scheduleMap[s.brand] = []
        scheduleMap[s.brand].push(s)
      })
      setScheduleByBrand(scheduleMap)

      setMeters(clients.map(c => {
        const brandPkgs = pkgByBrand[c.client_brand] || {}
        const brandPlanPkg = planSlotsByBrandPkg[c.client_brand] || {}
        const packages: PackageCapacity[] = Object.entries(brandPkgs)
          .map(([tipe, d]) => ({ tipe, ...d, planSlots: brandPlanPkg[tipe] || 0 }))
          .sort((a, b) => a.tipe.localeCompare(b.tipe))
        return {
          brand: c.client_brand,
          clientName: c.full_name,
          capacityHours: capacityByBrand[c.client_brand] || 0,
          capacitySlots: capacitySlotsByBrand[c.client_brand] || 0,
          planHours: planByBrand[c.client_brand] || 0,
          planSlots: planSlotsByBrand[c.client_brand] || 0,
          successHours: successByBrand[c.client_brand] || 0,
          successSlots: successSlotsByBrand[c.client_brand] || 0,
          packages,
        }
      }))
      setLoading(false)
    })
  }, [])

  async function toggleMemoChecked(reportId: string, brand: string, current: boolean) {
    const supabase = createClient()
    await supabase.from('live_reports').update({ memo_checked: !current }).eq('id', reportId)
    setMemosByBrand(prev => ({
      ...prev,
      [brand]: (prev[brand] || []).map(m => m.id === reportId ? { ...m, memo_checked: !current } : m)
    }))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">{lang === 'id' ? 'Client List' : 'Client List'}</h2>
          <p className="text-sm text-gray-500">{meters.length} {lang === 'id' ? 'client terdaftar' : 'registered clients'}</p>
        </div>
        <select value={monthIdx} onChange={e => setMonthIdx(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
          {monthOptions.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-32 animate-pulse"/>)}
        </div>
      ) : meters.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <p className="text-sm font-medium text-gray-400">Belum ada client terdaftar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {meters.map(m => {
            const hasHours = m.capacityHours > 0
            const planPct = hasHours ? Math.round((m.planHours / m.capacityHours) * 100) : 0
            const reportPct = m.planSlots > 0 ? Math.round((m.successSlots / m.planSlots) * 100) : 0
            const exceeds = m.planHours > m.capacityHours
            const isExpanded = expandedBrand === m.brand
            const allSlots = scheduleByBrand[m.brand] || []
            // jadwal table is scoped to the selected month
            const slots = allSlots.filter((s: any) =>
              s.slot_date >= selectedMonth.start && s.slot_date <= selectedMonth.end)
            return (
              <div key={m.brand} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">{m.brand}</p>
                      <p className="text-xs text-gray-400 truncate">{m.clientName}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                      exceeds ? 'bg-red-100 text-red-700'
                        : planPct >= 80 ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {hasHours ? `${planPct}%` : '—'}
                    </span>
                  </div>
                  {/* Hours focal point */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 text-center bg-brand-50 rounded-xl py-2 border border-brand-100">
                      <p className="text-[10px] text-brand-500 font-medium">Total Jam</p>
                      <p className="text-xl font-bold text-brand-700 leading-tight">{trimH(m.capacityHours)}j</p>
                    </div>
                    <div className="flex-1 text-center bg-orange-50 rounded-xl py-2 border border-orange-100">
                      <p className="text-[10px] text-orange-500 font-medium">Jam Live</p>
                      <p className="text-xl font-bold text-orange-700 leading-tight">{trimH(m.planHours)}j</p>
                    </div>
                    <div className="flex-1 text-center bg-emerald-50 rounded-xl py-2 border border-emerald-100">
                      <p className="text-[10px] text-emerald-500 font-medium">Report</p>
                      <p className="text-xl font-bold text-emerald-700 leading-tight">{m.successSlots}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 mb-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Laporan terkumpul</span>
                      <span className="font-semibold text-gray-800">
                        {m.planSlots > 0 ? `${m.successSlots} / ${m.planSlots} sesi` : 'Belum ada jadwal'}
                      </span>
                    </div>
                    {/* Stacked bar: orange = jam live scheduled, emerald = reports collected */}
                    <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-orange-400/30 rounded-full transition-all duration-500"
                        style={{ width: hasHours ? `${Math.min(planPct, 100)}%` : '0%' }}/>
                      <div className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: hasHours ? `${Math.min(reportPct, 100)}%` : '0%' }}/>
                    </div>
                    {exceeds && (
                      <p className="text-[10px] text-red-600 font-bold">⚠️ Lewat {trimH(m.planHours - m.capacityHours)}j!</p>
                    )}
                  </div>
                  {/* Per-package capacity breakdown */}
                  {m.packages.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Paket</p>
                      {m.packages.map(pkg => {
                        const pkgExceeds = pkg.planSlots > pkg.slots
                        return (
                          <div key={pkg.tipe}>
                            <div className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pkgExceeds ? 'bg-red-400' : 'bg-brand-400'}`}/>
                                <span className="font-semibold text-gray-700">{pkg.tipe}</span>
                                <span className="text-gray-400">· {pkg.jam_per_sesi}j/sesi</span>
                              </div>
                              <div className="text-right">
                                <span className={`font-bold ${pkgExceeds ? 'text-red-600' : 'text-gray-800'}`}>
                                  {pkg.planSlots}/{pkg.slots} slot
                                </span>
                                <span className="text-gray-400 ml-1">· {trimH(pkg.hours)}j</span>
                              </div>
                            </div>
                            {pkgExceeds && (
                              <p className="text-[10px] text-red-500 font-semibold mt-0.5 ml-3">
                                ⚠️ Lewat {pkg.planSlots - pkg.slots} slot
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {/* Memo Evaluation Checklist */}
                  {(memosByBrand[m.brand] || []).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Memo Evaluasi</p>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {(memosByBrand[m.brand] || []).map(memo => (
                          <label key={memo.id} className="flex items-start gap-2 cursor-pointer group">
                            <input type="checkbox" checked={memo.memo_checked}
                              onChange={() => toggleMemoChecked(memo.id, m.brand, memo.memo_checked)}
                              className="mt-0.5 rounded accent-brand-600 shrink-0"/>
                            <span className={`text-[11px] leading-snug ${memo.memo_checked ? 'line-through text-gray-300' : 'text-gray-600'}`}>
                              {memo.notes}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {slots.length > 0 && (
                    <button
                      onClick={() => setExpandedBrand(isExpanded ? null : m.brand)}
                      className="flex items-center gap-1.5 text-[10px] text-brand-600 font-semibold hover:text-brand-700 transition-colors mt-3">
                      {isExpanded ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                      {isExpanded ? 'Sembunyikan' : `Lihat ${slots.length} jadwal`}
                    </button>
                  )}
                </div>

                {isExpanded && slots.length > 0 && (
                  <div className="border-t border-gray-100 bg-gray-50/50">
                    <div className="overflow-x-auto max-h-52 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0">
                          <tr className="bg-gray-100 text-gray-500 uppercase tracking-wide text-[10px]">
                            <th className="px-3 py-2 text-left font-semibold">Tanggal</th>
                            <th className="px-3 py-2 text-left font-semibold">Sesi</th>
                            <th className="px-3 py-2 text-left font-semibold">Host</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {slots.map((s: any) => (
                            <tr key={s.id} className="hover:bg-gray-100 transition-colors">
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                                {new Date(s.slot_date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </td>
                              <td className="px-3 py-2 text-gray-500">Sesi {s.session_no}</td>
                              <td className="px-3 py-2 font-medium text-gray-800">{(s.profiles as any)?.full_name || '—'}</td>
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
