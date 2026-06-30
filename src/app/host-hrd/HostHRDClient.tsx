'use client'
import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, getPayPeriod } from '@/lib/utils'
import { Clock, Wallet, CreditCard, Plus, X, AlertCircle, CheckCircle, XCircle, Timer } from 'lucide-react'
import PettyCashHostPanel from '@/app/my-schedule/PettyCashHostPanel'

type Tab = 'gaji' | 'kasbon' | 'pettycash'

interface CheckInRow {
  id: string; total_hours: number | null; slot_id: string
  schedule_slots: { slot_date: string; session_no: number; brand: string | null; platform: string | null; rooms: { name: string } | null } | null
}
interface KasbonRow {
  id: string; host_id: string; amount: number; requested_amount: number | null
  reason: string | null; request_note: string | null; status: string
  request_status: string | null; created_at: string; paid_at: string | null; approved_at: string | null
}

const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
function fmtDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DAYS_ID[dt.getDay()]}, ${dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

// ── Gaji Tab ──────────────────────────────────────────────────────────────────
function GajiTab({ profile }: { profile: any }) {
  const [checkIns, setCheckIns] = useState<CheckInRow[]>([])
  const [kasbonTotal, setKasbonTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const payPeriod = getPayPeriod()

  const periodStart = payPeriod.start.toISOString().split('T')[0]
  // period end = periodStart + 1 month, day 20
  const endDate = new Date(payPeriod.start)
  endDate.setMonth(endDate.getMonth() + 1)
  endDate.setDate(20)
  const periodEnd = endDate.toISOString().split('T')[0]

  const periodLabel = `${payPeriod.start.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('check_ins')
        .select('id, total_hours, slot_id, schedule_slots(slot_date, session_no, brand, platform, rooms(name))')
        .eq('host_id', profile.id)
        .gte('schedule_slots.slot_date', periodStart)
        .lte('schedule_slots.slot_date', periodEnd)
        .not('total_hours', 'is', null)
        .order('created_at'),
      supabase.from('kasbon')
        .select('amount').eq('host_id', profile.id).eq('status', 'unpaid'),
    ]).then(([ciRes, kbRes]) => {
      const rows = ((ciRes.data || []).filter((r: any) => r.schedule_slots !== null)) as unknown as CheckInRow[]
      setCheckIns(rows)
      const kb = (kbRes.data || []).reduce((s: number, k: any) => s + Number(k.amount), 0)
      setKasbonTotal(kb)
      setLoading(false)
    })
  }, [profile.id, periodStart, periodEnd])

  const hourlyRate = Number(profile.hourly_rate || 0)
  const totalHours = checkIns.reduce((s, r) => s + Number(r.total_hours || 0), 0)
  const grossSalary = totalHours * hourlyRate
  const netSalary = Math.max(0, grossSalary - kasbonTotal)

  if (loading) return <div className="p-12 text-center text-sm text-gray-400">Memuat data gaji...</div>

  return (
    <div className="space-y-5">
      {/* Period & Summary cards */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Periode Gaji</p>
        <p className="text-sm font-semibold text-gray-800">{periodLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-brand-50 border border-brand-100 rounded-2xl p-4">
          <p className="text-xs text-brand-500 font-medium mb-1">Tarif per Jam</p>
          <p className="text-xl font-bold text-brand-700">{formatCurrency(hourlyRate)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          <p className="text-xs text-emerald-600 font-medium mb-1">Total Jam Tercatat</p>
          <p className="text-xl font-bold text-emerald-700">{totalHours.toFixed(2)} jam</p>
          <p className="text-[10px] text-emerald-500 mt-0.5">{checkIns.length} sesi</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-medium mb-1">Gaji Kotor</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(grossSalary)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{totalHours.toFixed(2)} jam × {formatCurrency(hourlyRate)}</p>
        </div>
        {kasbonTotal > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
            <p className="text-xs text-red-500 font-medium mb-1">Potongan Kasbon</p>
            <p className="text-xl font-bold text-red-600">- {formatCurrency(kasbonTotal)}</p>
          </div>
        )}
      </div>

      {/* Net salary highlight */}
      <div className="bg-brand-600 rounded-2xl p-5 text-white">
        <p className="text-sm font-medium opacity-80 mb-1">Estimasi Gaji Bersih</p>
        <p className="text-3xl font-bold">{formatCurrency(netSalary)}</p>
        {kasbonTotal > 0 && (
          <p className="text-xs opacity-70 mt-1">Sudah dipotong kasbon {formatCurrency(kasbonTotal)}</p>
        )}
        <p className="text-[10px] opacity-60 mt-2">* Berdasarkan live report yang sudah disubmit periode ini</p>
      </div>

      {/* Session breakdown */}
      {checkIns.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <p className="px-4 py-3 text-xs font-bold text-gray-500 border-b border-gray-50">Detail Sesi</p>
          <div className="divide-y divide-gray-50">
            {checkIns.map(ci => {
              const slot = ci.schedule_slots
              if (!slot) return null
              const hours = Number(ci.total_hours || 0)
              return (
                <div key={ci.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {slot.brand || '—'} {slot.platform ? `· ${slot.platform}` : ''}
                    </p>
                    <p className="text-xs text-gray-400">{fmtDate(slot.slot_date)} · {slot.rooms?.name || 'Room ?'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-emerald-700">{hours.toFixed(2)} jam</p>
                    <p className="text-[10px] text-gray-400">{formatCurrency(hours * hourlyRate)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {checkIns.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400">Belum ada live report yang disubmit periode ini</p>
        </div>
      )}
    </div>
  )
}

// ── Kasbon Tab ────────────────────────────────────────────────────────────────
function KasbonTab({ profile }: { profile: any }) {
  const [kasbons, setKasbons] = useState<KasbonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ amount: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    const { data } = await createClient().from('kasbon')
      .select('*').eq('host_id', profile.id).order('created_at', { ascending: false })
    setKasbons((data as KasbonRow[]) || [])
    setLoading(false)
  }, [profile.id])

  useEffect(() => { load() }, [load])

  async function submitRequest() {
    const amt = Number(form.amount)
    if (!amt || amt <= 0) { setFormError('Isi nominal kasbon'); return }
    setSaving(true); setFormError('')
    const { error } = await createClient().from('kasbon').insert({
      host_id: profile.id,
      amount: amt,
      requested_amount: amt,
      request_note: form.reason || null,
      reason: form.reason || null,
      status: 'unpaid',
      request_status: 'pending',
    })
    setSaving(false)
    if (error) { setFormError(error.message); return }
    setShowForm(false); setForm({ amount: '', reason: '' }); load()
  }

  const totalUnpaid = kasbons
    .filter(k => k.status === 'unpaid' && (k.request_status === 'approved' || k.request_status === null))
    .reduce((s, k) => s + Number(k.amount), 0)

  function statusBadge(k: KasbonRow) {
    if (k.request_status === 'pending') return <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Timer size={9}/>Menunggu ACC</span>
    if (k.request_status === 'rejected') return <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><XCircle size={9}/>Ditolak</span>
    if (k.status === 'paid') return <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><CheckCircle size={9}/>Lunas</span>
    return <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">Belum Lunas</span>
  }

  if (loading) return <div className="p-12 text-center text-sm text-gray-400">Memuat kasbon...</div>

  return (
    <div className="space-y-4">
      {/* Summary */}
      {totalUnpaid > 0 && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle size={18} className="text-orange-500 flex-shrink-0"/>
          <div>
            <p className="text-sm font-bold text-orange-800">Sisa Hutang Kasbon</p>
            <p className="text-xl font-bold text-orange-700 mt-0.5">{formatCurrency(totalUnpaid)}</p>
            <p className="text-xs text-orange-500 mt-0.5">Akan dipotong dari gaji periode berikutnya</p>
          </div>
        </div>
      )}

      {/* Request form */}
      {showForm ? (
        <div className="bg-white rounded-2xl border border-brand-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-gray-900 text-sm">Ajukan Kasbon</p>
            <button onClick={() => { setShowForm(false); setFormError('') }}><X size={16} className="text-gray-400"/></button>
          </div>
          {/* Important note */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-amber-600 mt-0.5 flex-shrink-0"/>
            <p className="text-xs text-amber-800 font-medium">
              Request Kasbon tetap harus kontak <strong>Koko & Cici</strong> untuk memastikan ACC
            </p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Nominal yang Diajukan (Rp) *</label>
            <input type="number" min="10000" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="500000"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Keperluan / Alasan</label>
            <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Transport ke lokasi event, dll."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
          </div>
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); setFormError('') }}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">Batal</button>
            <button onClick={submitRequest} disabled={saving}
              className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-60">
              {saving ? 'Mengirim...' : 'Kirim Request'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-brand-700 transition-colors shadow-sm">
          <Plus size={15}/> Ajukan Kasbon
        </button>
      )}

      {/* Kasbon list */}
      {kasbons.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400">Belum ada kasbon</p>
        </div>
      ) : (
        <div className="space-y-2">
          {kasbons.map(k => (
            <div key={k.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {statusBadge(k)}
                    <span className="text-[10px] text-gray-400">
                      {new Date(k.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  {/* If pending show requested amount, otherwise show approved amount */}
                  {k.request_status === 'pending' ? (
                    <p className="font-bold text-gray-900">
                      {formatCurrency(Number(k.requested_amount || k.amount))}
                      <span className="text-xs font-normal text-gray-400 ml-1">(diajukan)</span>
                    </p>
                  ) : k.request_status === 'approved' && k.requested_amount && Number(k.requested_amount) !== Number(k.amount) ? (
                    <div>
                      <p className="font-bold text-gray-900">{formatCurrency(Number(k.amount))}
                        <span className="text-xs font-normal text-gray-400 ml-1">(disetujui)</span>
                      </p>
                      <p className="text-xs text-gray-400">Diajukan: {formatCurrency(Number(k.requested_amount))}</p>
                    </div>
                  ) : (
                    <p className="font-bold text-gray-900">{formatCurrency(Number(k.amount))}</p>
                  )}
                  {(k.request_note || k.reason) && (
                    <p className="text-xs text-gray-400 mt-0.5">{k.request_note || k.reason}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HostHRDClient({ profile }: { profile: any }) {
  const [tab, setTab] = useState<Tab>('gaji')

  const TAB_LABELS: Record<Tab, string> = {
    gaji: 'Gaji',
    kasbon: 'Kasbon',
    pettycash: 'Petty Cash',
  }

  return (
    <AppShell role="host" userName={profile.full_name}>
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">HRD</h1>
          <p className="text-sm text-gray-500 mt-0.5">Informasi gaji, kasbon & petty cash kamu</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
          {(['gaji', 'kasbon', 'pettycash'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === 'gaji'     && <GajiTab profile={profile}/>}
        {tab === 'kasbon'   && <KasbonTab profile={profile}/>}
        {tab === 'pettycash' && <PettyCashHostPanel profile={profile}/>}
      </div>
    </AppShell>
  )
}
