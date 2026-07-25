'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { toLocalDateStr } from '@/lib/utils'
import {
  Camera, LogIn, LogOut, CheckCircle2, Clock, Plus, X, Timer, XCircle, AlertCircle,
} from 'lucide-react'

interface AttendanceRow {
  id: string; date: string
  clock_in: string | null; clock_in_photo_url: string | null
  clock_out: string | null; clock_out_photo_url: string | null
}
interface LemburRow {
  id: string; date: string; hours: number; reason: string | null
  request_status: string; created_at: string
}

const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
function fmtDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DAYS_ID[dt.getDay()]}, ${dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function AbsensiClient({ profile }: { profile: any }) {
  const todayStr = toLocalDateStr(new Date())
  const [today, setToday] = useState<AttendanceRow | null>(null)
  const [history, setHistory] = useState<AttendanceRow[]>([])
  const [lemburs, setLemburs] = useState<LemburRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingClock, setSavingClock] = useState<'in' | 'out' | null>(null)
  const [clockError, setClockError] = useState('')

  const [showLemburForm, setShowLemburForm] = useState(false)
  const [lemburForm, setLemburForm] = useState({ date: todayStr, hours: '', reason: '' })
  const [savingLembur, setSavingLembur] = useState(false)
  const [lemburError, setLemburError] = useState('')

  const clockInRef = useRef<HTMLInputElement>(null)
  const clockOutRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const since = new Date(); since.setDate(since.getDate() - 30)
    const sinceStr = toLocalDateStr(since)
    const [todayRes, histRes, lemburRes] = await Promise.all([
      supabase.from('attendance').select('*').eq('operator_id', profile.id).eq('date', todayStr).maybeSingle(),
      supabase.from('attendance').select('*').eq('operator_id', profile.id)
        .gte('date', sinceStr).lt('date', todayStr).order('date', { ascending: false }),
      supabase.from('lembur_requests').select('*').eq('operator_id', profile.id)
        .order('created_at', { ascending: false }).limit(20),
    ])
    setToday((todayRes.data as AttendanceRow) || null)
    setHistory((histRes.data as AttendanceRow[]) || [])
    setLemburs((lemburRes.data as LemburRow[]) || [])
    setLoading(false)
  }, [profile.id, todayStr])

  useEffect(() => { load() }, [load])

  // ── Photo stamp: upload to Supabase Storage (for in-app display), then
  // best-effort push a copy to Google Drive under Absensi Ops / [Name].
  async function pushToDrive(file: File, kind: 'Masuk' | 'Keluar') {
    try {
      const clean = (s: string) => (s || '').replace(/[.\\/]+/g, ' ').replace(/\s+/g, ' ').trim()
      const ext = file.name.split('.').pop() || 'jpg'
      const filename = `${todayStr}.${clean(profile.full_name)}.${kind}.${ext}`
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      await fetch('/api/drive/absensi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op_name: profile.full_name, filename, mime: file.type || 'image/jpeg', base64 }),
      })
    } catch { /* non-fatal */ }
  }

  async function handleClockPhoto(e: React.ChangeEvent<HTMLInputElement>, which: 'in' | 'out') {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSavingClock(which); setClockError('')
    const supabase = createClient()
    const now = new Date().toISOString()

    let url: string | null = null
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `attendance/${profile.id}/${todayStr}-${which}-${Date.now()}.${ext}`
      const { data, error: upErr } = await supabase.storage.from('live-reports').upload(path, file, { contentType: file.type })
      if (!upErr && data) url = supabase.storage.from('live-reports').getPublicUrl(data.path).data.publicUrl
    } catch { /* non-fatal — save timestamp without photo */ }

    if (which === 'in') {
      const { data, error } = await supabase.from('attendance')
        .insert({ operator_id: profile.id, date: todayStr, clock_in: now, clock_in_photo_url: url })
        .select().single()
      if (error) { setClockError(error.message); setSavingClock(null); return }
      setToday(data as AttendanceRow)
    } else {
      if (!today) { setSavingClock(null); return }
      const { data, error } = await supabase.from('attendance')
        .update({ clock_out: now, clock_out_photo_url: url })
        .eq('id', today.id).select().single()
      if (error) { setClockError(error.message); setSavingClock(null); return }
      setToday(data as AttendanceRow)
    }
    setSavingClock(null)
    await pushToDrive(file, which === 'in' ? 'Masuk' : 'Keluar')
  }

  async function submitLembur() {
    const hrs = parseFloat(lemburForm.hours)
    if (!lemburForm.date || !hrs || hrs <= 0) { setLemburError('Isi tanggal dan jumlah jam'); return }
    setSavingLembur(true); setLemburError('')
    const { data, error } = await createClient().from('lembur_requests').insert({
      operator_id: profile.id, date: lemburForm.date, hours: hrs,
      reason: lemburForm.reason || null, request_status: 'pending',
    }).select().single()
    setSavingLembur(false)
    if (error) { setLemburError(error.message); return }
    setLemburs(prev => [data as LemburRow, ...prev])
    setShowLemburForm(false)
    setLemburForm({ date: todayStr, hours: '', reason: '' })
  }

  function lemburBadge(l: LemburRow) {
    if (l.request_status === 'pending') return <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 w-fit"><Timer size={9}/>Menunggu ACC</span>
    if (l.request_status === 'rejected') return <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 w-fit"><XCircle size={9}/>Ditolak</span>
    return <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 w-fit"><CheckCircle2 size={9}/>Disetujui</span>
  }

  if (loading) {
    return (
      <AppShell role="operator" userName={profile.full_name}>
        <div className="p-12 text-center text-sm text-gray-400">Memuat...</div>
      </AppShell>
    )
  }

  return (
    <AppShell role="operator" userName={profile.full_name}>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Absensi</h1>
          <p className="text-sm text-gray-500 mt-0.5">{fmtDate(todayStr)}</p>
        </div>

        {/* ── Today's clock in/out ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Absen Masuk</p>
              {today?.clock_in ? (
                <div className="flex items-center gap-2">
                  {today.clock_in_photo_url ? (
                    <button onClick={() => window.open(today.clock_in_photo_url!, '_blank')}>
                      <img src={today.clock_in_photo_url} alt="Masuk" className="w-10 h-10 rounded-lg object-cover border border-emerald-200"/>
                    </button>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><Camera size={16} className="text-emerald-300"/></div>
                  )}
                  <p className="text-lg font-bold text-emerald-700">{fmtTime(today.clock_in)}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-300">— Belum absen</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Absen Keluar</p>
              {today?.clock_out ? (
                <div className="flex items-center gap-2">
                  {today.clock_out_photo_url ? (
                    <button onClick={() => window.open(today.clock_out_photo_url!, '_blank')}>
                      <img src={today.clock_out_photo_url} alt="Keluar" className="w-10 h-10 rounded-lg object-cover border border-blue-200"/>
                    </button>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><Camera size={16} className="text-blue-300"/></div>
                  )}
                  <p className="text-lg font-bold text-blue-700">{fmtTime(today.clock_out)}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-300">— Belum absen</p>
              )}
            </div>
          </div>

          {clockError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{clockError}</p>}

          <div className="flex gap-2">
            <input ref={clockInRef} type="file" accept="image/*" capture="user" className="hidden"
              onChange={e => handleClockPhoto(e, 'in')}/>
            <input ref={clockOutRef} type="file" accept="image/*" capture="user" className="hidden"
              onChange={e => handleClockPhoto(e, 'out')}/>
            <button onClick={() => clockInRef.current?.click()}
              disabled={!!today?.clock_in || savingClock !== null}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <LogIn size={15}/> {savingClock === 'in' ? 'Menyimpan...' : 'Absen Masuk'}
            </button>
            <button onClick={() => clockOutRef.current?.click()}
              disabled={!today?.clock_in || !!today?.clock_out || savingClock !== null}
              className="flex-1 flex items-center justify-center gap-2 bg-brand-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <LogOut size={15}/> {savingClock === 'out' ? 'Menyimpan...' : 'Absen Keluar'}
            </button>
          </div>
        </div>

        {/* ── Lembur ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">Request Lembur</p>
            {!showLemburForm && (
              <button onClick={() => setShowLemburForm(true)}
                className="flex items-center gap-1.5 bg-brand-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-brand-700 transition-colors">
                <Plus size={13}/> Ajukan
              </button>
            )}
          </div>

          {showLemburForm && (
            <div className="bg-white rounded-2xl border border-brand-100 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-900 text-sm">Ajukan Lembur</p>
                <button onClick={() => { setShowLemburForm(false); setLemburError('') }}><X size={16} className="text-gray-400"/></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Tanggal *</label>
                  <input type="date" value={lemburForm.date} onChange={e => setLemburForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Jumlah Jam *</label>
                  <input type="number" min="0" step="0.5" value={lemburForm.hours} placeholder="2"
                    onChange={e => setLemburForm(f => ({ ...f, hours: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Alasan</label>
                <input value={lemburForm.reason} onChange={e => setLemburForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Tutup buku bulanan, dll."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              </div>
              {lemburError && <p className="text-xs text-red-600">{lemburError}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setShowLemburForm(false); setLemburError('') }}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">Batal</button>
                <button onClick={submitLembur} disabled={savingLembur}
                  className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-60">
                  {savingLembur ? 'Mengirim...' : 'Kirim Request'}
                </button>
              </div>
            </div>
          )}

          {lemburs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
              <p className="text-sm text-gray-400">Belum ada request lembur</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lemburs.map(l => (
                <div key={l.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {lemburBadge(l)}
                        <span className="text-[10px] text-gray-400">{fmtDate(l.date)}</span>
                      </div>
                      <p className="font-bold text-gray-900 text-sm">{l.hours} jam</p>
                      {l.reason && <p className="text-xs text-gray-400 mt-0.5">{l.reason}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── History ── */}
        <div className="space-y-2">
          <p className="text-sm font-bold text-gray-900">Riwayat Absensi</p>
          {history.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
              <p className="text-sm text-gray-400">Belum ada riwayat</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {history.map(h => (
                <div key={h.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-600 font-medium">{fmtDate(h.date)}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                      <Clock size={11}/> {h.clock_in ? fmtTime(h.clock_in) : '—'}
                    </span>
                    <span className="text-gray-300">→</span>
                    <span className="flex items-center gap-1 text-blue-600 font-semibold">
                      <Clock size={11}/> {h.clock_out ? fmtTime(h.clock_out) : '—'}
                    </span>
                    {!h.clock_out && h.clock_in && (
                      <AlertCircle size={12} className="text-amber-400"/>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
