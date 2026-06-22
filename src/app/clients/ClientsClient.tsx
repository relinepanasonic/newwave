'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import InvoicePanel from '@/app/invoice/InvoicePanel'
import ProductEtalasePanel from './ProductEtalasePanel'
import { ChevronDown, ChevronUp } from 'lucide-react'

type Tab = 'clients' | 'invoice' | 'products'

interface ClientProfile { id: string; full_name: string; client_brand: string }
interface ClientMeter {
  brand: string; clientName: string
  capacityHours: number   // total slot hours purchased (from invoices)
  planHours: number       // total scheduled live hours
  successHours: number    // scheduled hours that already have a live report
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

function ClientListTab() {
  const [meters, setMeters] = useState<ClientMeter[]>([])
  const [scheduleByBrand, setScheduleByBrand] = useState<Record<string, any[]>>({})
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
        .select('id, brand, slot_date, session_no, durasi, profiles:host_id(full_name)')
        .not('host_id', 'is', null)
        .order('slot_date')
        .then(({ data }) => data || []),
      supabase.from('live_reports').select('id, slot_id, brand')
        .then(({ data }) => data || []),
      supabase.from('invoices').select('brand, invoice_items(jam_per_sesi, qty)')
        .then(({ data }) => data || []),
    ]).then(([clients, slots, reports, invoices]) => {
      // Slot capacity (hours) purchased per brand = Σ(jam_per_sesi × qty) over invoice items
      const capacityByBrand: Record<string, number> = {}
      ;(invoices as any[]).forEach((inv: any) => {
        if (!inv.brand) return
        const hrs = (inv.invoice_items || []).reduce(
          (s: number, it: any) => s + (Number(it.jam_per_sesi) || 0) * (Number(it.qty) || 0), 0)
        capacityByBrand[inv.brand] = (capacityByBrand[inv.brand] || 0) + hrs
      })

      // Which slots already have a live report (success)
      const reportedSlotIds = new Set(
        (reports as any[]).map((r: any) => r.slot_id).filter(Boolean))

      const planByBrand: Record<string, number> = {}
      const successByBrand: Record<string, number> = {}
      const scheduleMap: Record<string, any[]> = {}
      ;(slots as any[]).forEach((s: any) => {
        if (!s.brand) return
        const dur = Number(s.durasi) || 1
        planByBrand[s.brand] = (planByBrand[s.brand] || 0) + dur
        if (reportedSlotIds.has(s.id))
          successByBrand[s.brand] = (successByBrand[s.brand] || 0) + dur
        if (!scheduleMap[s.brand]) scheduleMap[s.brand] = []
        scheduleMap[s.brand].push(s)
      })
      setScheduleByBrand(scheduleMap)

      setMeters(clients.map(c => ({
        brand: c.client_brand,
        clientName: c.full_name,
        capacityHours: capacityByBrand[c.client_brand] || 0,
        planHours: planByBrand[c.client_brand] || 0,
        successHours: successByBrand[c.client_brand] || 0,
      })))
      setLoading(false)
    })
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">Client List</h2>
          <p className="text-sm text-gray-500">{meters.length} client terdaftar</p>
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
            const hasSlot = m.capacityHours > 0
            const planPct = hasSlot ? Math.round((m.planHours / m.capacityHours) * 100) : 0
            const successPct = hasSlot ? Math.round((m.successHours / m.capacityHours) * 100) : 0
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
                      {hasSlot ? `${planPct}%` : '—'}
                    </span>
                  </div>
                  <div className="space-y-1.5 mb-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Usage</span>
                      <span className="font-semibold text-gray-800">
                        {hasSlot ? `${trimH(m.planHours)} / ${trimH(m.capacityHours)} jam` : 'Belum ada slot'}
                      </span>
                    </div>
                    {/* Stacked bar: orange = total plan (low opacity), red = live sukses */}
                    <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-orange-400/30 rounded-full transition-all duration-500"
                        style={{ width: hasSlot ? `${Math.min(planPct, 100)}%` : '0%' }}/>
                      <div className="absolute inset-y-0 left-0 bg-red-500 rounded-full transition-all duration-500"
                        style={{ width: hasSlot ? `${Math.min(successPct, 100)}%` : '0%' }}/>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span className="flex items-center gap-2.5">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"/>Sukses {trimH(m.successHours)}j</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400/50"/>Plan {trimH(m.planHours)}j</span>
                      </span>
                      {exceeds && (
                        <span className="text-red-600 font-bold">Lewat {trimH(m.planHours - m.capacityHours)}j!</span>
                      )}
                    </div>
                  </div>
                  {slots.length > 0 && (
                    <button
                      onClick={() => setExpandedBrand(isExpanded ? null : m.brand)}
                      className="flex items-center gap-1.5 text-[10px] text-brand-600 font-semibold hover:text-brand-700 transition-colors">
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

export default function ClientsClient({ profile }: { profile: any }) {
  const [tab, setTab] = useState<Tab>('clients')

  return (
    <AppShell role="superadmin" userName={profile.full_name}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manajemen client, jadwal live & invoice</p>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
          {(['clients', 'invoice', 'products'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'clients' ? 'Client List' : t === 'invoice' ? 'Invoice' : 'Product Etalase'}
            </button>
          ))}
        </div>

        {tab === 'clients' ? <ClientListTab/>
          : tab === 'invoice' ? <InvoicePanel profile={profile}/>
          : <ProductEtalasePanel profile={profile}/>}
      </div>
    </AppShell>
  )
}
