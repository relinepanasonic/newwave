'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { Download, ExternalLink, Save, X, Edit2, CheckCircle, XCircle, FileText, Plane, Trash2, Plus, Wallet, Camera, Clock } from 'lucide-react'
import { formatCurrency, getPayPeriod, toLocalDateStr } from '@/lib/utils'
import { tr } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'
import PettyCashPanel from './PettyCashPanel'
import CurrencyInput from '@/components/CurrencyInput'

type Tab = 'hosts' | 'gaji' | 'kasbon' | 'pettycash' | 'absensi'

interface Kasbon {
  id: string; host_id: string; amount: number; reason?: string
  status: string; created_at: string; paid_at?: string
}

interface Host {
  id: string
  full_name: string
  username?: string
  phone?: string
  alamat?: string
  nik_id?: string
  ktp_photo_url?: string
  gdrive_ktp_url?: string
  gdrive_folder_url?: string
  tipe_host?: string
  target_hours?: number
  is_active?: boolean
  created_at: string
  role?: string
}

interface PayRow {
  host_id: string; full_name: string; username: string | null; hourly_rate: number
  scheduledHours: number; forecastSalary: number
  reportedHours: number; actualSalary: number
  tunjangan: number; bonus: number; kasbonDibayar: number; pinalti: number
  netSalary: number
}

interface SessionDetailRow {
  slot_id: string; date: string; time: string; hour: number
  brand: string; platform: string; hasReport: boolean
  gmv: number; impression: number; viewer: number; trans: number; comment_count: number
}

function fmtShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

function periodLabel(start: string): string {
  const s = new Date(start)
  const e = new Date(s)
  e.setMonth(e.getMonth() + 1)
  e.setDate(20)
  return `${s.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} – ${e.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

// ── Host List Tab ─────────────────────────────────────────────────────────────
function HostListTab() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<Host>>({})
  const [saving, setSaving] = useState(false)
  const [blockingId, setBlockingId] = useState<string | null>(null)

  // Cuti (on-leave) modal
  const [cutiHost, setCutiHost] = useState<Host | null>(null)
  const [cutiReason, setCutiReason] = useState('')
  const [cutiSaving, setCutiSaving] = useState(false)

  // Delete (fired) confirmation
  const [deleteHost, setDeleteHost] = useState<Host | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [clearData, setClearData] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles')
      .select('id, full_name, username, phone, alamat, nik_id, ktp_photo_url, gdrive_ktp_url, gdrive_folder_url, tipe_host, target_hours, is_active, created_at, role')
      .in('role', ['host', 'host_manager'])
      .order('full_name')
      .then(({ data }) => {
        setHosts(data || [])
        setLoading(false)
      })
  }, [])

  function startEdit(host: Host) {
    setEditingId(host.id)
    setEditValues({ gdrive_ktp_url: host.gdrive_ktp_url || '', phone: host.phone || '', username: host.username || '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValues({})
  }

  async function saveEdit(hostId: string) {
    setSaving(true)
    const { error } = await createClient().from('profiles')
      .update({ gdrive_ktp_url: editValues.gdrive_ktp_url || null, phone: editValues.phone || null, username: editValues.username || null })
      .eq('id', hostId)
    setSaving(false)
    if (!error) {
      setHosts(prev => prev.map(h => h.id === hostId ? { ...h, ...editValues } : h))
      setEditingId(null)
    }
  }

  // Reactivate a host who is on leave
  async function reactivate(host: Host) {
    setBlockingId(host.id)
    const { error } = await createClient().from('profiles')
      .update({ is_active: true })
      .eq('id', host.id)
    setBlockingId(null)
    if (!error) {
      setHosts(prev => prev.map(h => h.id === host.id ? { ...h, is_active: true } : h))
    }
  }

  // Set a host on leave (Cuti). is_active=false is the reliable access flag;
  // the leave reason is stored best-effort (requires optional leave_reason column).
  async function confirmCuti() {
    if (!cutiHost) return
    setCutiSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('profiles')
      .update({ is_active: false })
      .eq('id', cutiHost.id)
    // Best-effort: persist reason if the column exists (ignored otherwise)
    if (cutiReason.trim()) {
      await supabase.from('profiles')
        .update({ leave_reason: cutiReason.trim() } as any)
        .eq('id', cutiHost.id)
        .then(() => {}, () => {})
    }
    setCutiSaving(false)
    if (!error) {
      setHosts(prev => prev.map(h => h.id === cutiHost.id ? { ...h, is_active: false } : h))
      setCutiHost(null); setCutiReason('')
    }
  }

  // Permanently delete a host (fired) via server route (needs service role)
  async function confirmDelete() {
    if (!deleteHost) return
    setDeleting(true)
    const res = await fetch('/api/delete-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_id: deleteHost.id, clear_data: clearData }),
    })
    setDeleting(false)
    if (res.ok) {
      setHosts(prev => prev.filter(h => h.id !== deleteHost.id))
      setDeleteHost(null)
      setClearData(false)
    } else {
      const body = await res.json().catch(() => ({}))
      alert('Gagal hapus host: ' + (body.error || res.statusText))
    }
  }

  function downloadCSV() {
    const headers = ['No', 'Nama', 'Status', 'Tipe Host', 'No HP', 'Alamat', 'NIK', 'Link KTP (Supabase)', 'Link Foto GDrive', 'Target Jam', 'Bergabung']
    const rows = hosts.map((h, i) => [
      i + 1,
      h.full_name,
      h.is_active === false ? 'Nonaktif' : 'Aktif',
      h.tipe_host || '',
      h.phone || '',
      h.alamat || '',
      h.nik_id || '',
      h.ktp_photo_url || '',
      h.gdrive_ktp_url || '',
      h.target_hours || 155,
      new Date(h.created_at).toLocaleDateString('id-ID'),
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `HRD-NewWave-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const activeCount = hosts.filter(h => h.is_active !== false).length
  const blockedCount = hosts.filter(h => h.is_active === false).length

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <p className="text-sm text-gray-500">
            {hosts.length} host terdaftar · {activeCount} aktif
            {blockedCount > 0 && ` · ${blockedCount} diblokir`}
          </p>
          <a href="https://drive.google.com/drive/folders/16J8ZA8R0nc0IshWnJpKv1a0mhksZ44ji?usp=sharing"
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-1.5 text-xs text-brand-600 hover:underline font-medium">
            <ExternalLink size={12}/> Buka Folder Google Drive KTP
          </a>
        </div>
        <button onClick={downloadCSV}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors">
          <Download size={14}/> Download CSV
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-400">Memuat...</div>
      ) : hosts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-400">Belum ada host terdaftar</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left font-semibold w-8">No</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[140px]">Nama</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[90px]">Panggilan</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[70px]">Status</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[100px]">Tipe</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[110px]">No HP</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[140px]">NIK</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[80px]">Foto KTP</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Link GDrive</th>
                  <th className="px-4 py-3 text-left font-semibold w-24">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {hosts.map((host, idx) => {
                  const isBlocked = host.is_active === false
                  return (
                    <tr key={host.id} className={`hover:bg-gray-50/60 transition-colors ${isBlocked ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-gray-900">{host.full_name}</p>
                          {host.role === 'host_manager' && (
                            <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">Manager</span>
                          )}
                        </div>
                        {host.phone && <p className="text-[10px] text-gray-400">{host.phone}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {editingId === host.id ? (
                          <input value={editValues.username || ''}
                            onChange={e => setEditValues(v => ({ ...v, username: e.target.value }))}
                            placeholder="e.g. Anggi"
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                        ) : host.username ? (
                          <span className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-semibold">{host.username}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          isBlocked ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isBlocked ? 'Cuti' : 'Aktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {host.tipe_host ? (
                          <span className="text-xs bg-brand-50 text-brand-700 border border-brand-100 px-2 py-0.5 rounded-full font-medium">
                            {host.tipe_host}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {editingId === host.id ? (
                          <input value={editValues.phone || ''} onChange={e => setEditValues(v => ({ ...v, phone: e.target.value }))}
                            placeholder="08xx"
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                        ) : host.phone || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-600">
                        {host.nik_id ? (
                          <span className="tracking-wider">{host.nik_id}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {host.ktp_photo_url ? (
                          <a href={host.ktp_photo_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                            <ExternalLink size={11}/> Lihat
                          </a>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === host.id ? (
                          <input value={editValues.gdrive_ktp_url || ''}
                            onChange={e => setEditValues(v => ({ ...v, gdrive_ktp_url: e.target.value }))}
                            placeholder="https://drive.google.com/..."
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 min-w-[200px]"/>
                        ) : host.gdrive_folder_url ? (
                          <a href={host.gdrive_folder_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline max-w-[160px] truncate">
                            <ExternalLink size={11}/> Folder Host
                          </a>
                        ) : host.gdrive_ktp_url ? (
                          <a href={host.gdrive_ktp_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline max-w-[160px] truncate">
                            <ExternalLink size={11}/> Drive Link
                          </a>
                        ) : (
                          <span className="text-xs text-gray-300">— belum ada</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {editingId === host.id ? (
                            <>
                              <button onClick={() => saveEdit(host.id)} disabled={saving}
                                className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 disabled:opacity-50">
                                <Save size={13}/>
                              </button>
                              <button onClick={cancelEdit}
                                className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200">
                                <X size={13}/>
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(host)}
                                title="Edit"
                                className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-brand-100 hover:text-brand-700 transition-colors">
                                <Edit2 size={13}/>
                              </button>
                              {isBlocked ? (
                                <button
                                  onClick={() => reactivate(host)}
                                  disabled={blockingId === host.id}
                                  title="Aktifkan kembali"
                                  className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors disabled:opacity-50">
                                  <CheckCircle size={13}/>
                                </button>
                              ) : (
                                <button
                                  onClick={() => { setCutiHost(host); setCutiReason('') }}
                                  title="Cuti / On Leave"
                                  className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-amber-100 hover:text-amber-600 transition-colors">
                                  <Plane size={13}/>
                                </button>
                              )}
                              <button
                                onClick={() => setDeleteHost(host)}
                                title="Hapus host (fired)"
                                className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600 transition-colors">
                                <Trash2 size={13}/>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cuti (on-leave) modal */}
      {cutiHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !cutiSaving && setCutiHost(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
              <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
                <Plane size={16} className="text-amber-500"/>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Cuti / On Leave</h3>
                <p className="text-[11px] text-gray-400">{cutiHost.full_name}</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500">Host yang sedang cuti tidak bisa login sampai diaktifkan kembali.</p>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Alasan / Keterangan (opsional)</label>
                <textarea value={cutiReason} onChange={e => setCutiReason(e.target.value)}
                  rows={2} placeholder="Cuti melahirkan, sakit, dll."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"/>
              </div>
              <div className="flex gap-2.5 pt-1">
                <button onClick={() => setCutiHost(null)} disabled={cutiSaving}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                  Batal
                </button>
                <button onClick={confirmCuti} disabled={cutiSaving}
                  className="flex-1 bg-amber-500 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-amber-600 disabled:opacity-60 transition-colors">
                  {cutiSaving ? 'Menyimpan...' : 'Set Cuti'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete (fired) confirmation modal */}
      {deleteHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !deleting && (setDeleteHost(null), setClearData(false))}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
              <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center">
                <Trash2 size={16} className="text-red-500"/>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Hapus Host</h3>
                <p className="text-[11px] text-gray-400">{deleteHost.full_name}</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500">
                Akun host ini akan dihapus permanen (fired). Tindakan ini tidak bisa dibatalkan.
              </p>
              {/* Toggle: clear data or keep history */}
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                clearData ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
              }`}>
                <input type="checkbox" checked={clearData} onChange={e => setClearData(e.target.checked)}
                  className="mt-0.5 accent-red-500 w-4 h-4 flex-shrink-0"/>
                <div>
                  <p className={`text-xs font-semibold ${clearData ? 'text-red-700' : 'text-gray-700'}`}>
                    Hapus jadwal &amp; laporan
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {clearData
                      ? 'Semua jadwal dan laporan host ini akan ikut dihapus.'
                      : 'Default: jadwal & laporan tetap tersimpan, hanya akun yang dihapus.'}
                  </p>
                </div>
              </label>
              <div className="flex gap-2.5 pt-1">
                <button onClick={() => { setDeleteHost(null); setClearData(false) }} disabled={deleting}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                  Batal
                </button>
                <button onClick={confirmDelete} disabled={deleting}
                  className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-red-600 disabled:opacity-60 transition-colors">
                  {deleting ? 'Menghapus...' : 'Hapus Permanen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Gaji Tab ──────────────────────────────────────────────────────────────────
function GajiTab() {
  const [rows, setRows] = useState<PayRow[]>([])
  const [excludedRows, setExcludedRows] = useState<PayRow[]>([])
  const [kasbonByHost, setKasbonByHost] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const currentPeriod = getPayPeriod()
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod.start.toISOString().split('T')[0].slice(0, 7))

  // Edit hourly rate
  const [editHost, setEditHost] = useState<PayRow | null>(null)
  const [editRate, setEditRate] = useState(0)
  const [savingRate, setSavingRate] = useState(false)

  // Exclude (delete) from this period
  const [confirmExcludeId, setConfirmExcludeId] = useState<string | null>(null)

  // Session detail popup
  const [detailHost, setDetailHost] = useState<PayRow | null>(null)
  const [detailRows, setDetailRows] = useState<SessionDetailRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const { periodStartStr, periodEndStr } = useMemo(() => {
    const [y, m] = selectedPeriod.split('-').map(Number)
    const p = getPayPeriod(new Date(y, m - 1, 21))
    return { periodStartStr: toLocalDateStr(p.start), periodEndStr: toLocalDateStr(p.end) }
  }, [selectedPeriod])

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [y, m] = selectedPeriod.split('-').map(Number)
    const period = getPayPeriod(new Date(y, m - 1, 21))
    const periodStart = toLocalDateStr(period.start)
    const periodEnd = toLocalDateStr(period.end)

    const [hostsRes, slotsRes, reportsRes, kasbonRes, exclRes, adjRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, username, hourly_rate').in('role', ['host', 'host_manager']).order('full_name'),
      supabase.from('schedule_slots').select('host_id, durasi').gte('slot_date', periodStart).lte('slot_date', periodEnd).not('host_id', 'is', null),
      supabase.from('live_reports').select('host_id, duration_hours').gte('report_date', periodStart).lte('report_date', periodEnd),
      supabase.from('kasbon').select('host_id, amount, paid_amount').eq('status', 'unpaid'),
      supabase.from('payroll_exclusions').select('host_id').eq('period_start', periodStart),
      supabase.from('payroll_adjustments').select('host_id, tunjangan, bonus, kasbon_dibayar, pinalti').eq('period_start', periodStart),
    ])

    const scheduledMap: Record<string, number> = {}
    ;(slotsRes.data || []).forEach((s: any) => { scheduledMap[s.host_id] = (scheduledMap[s.host_id] || 0) + Number(s.durasi || 0) })

    const reportedMap: Record<string, number> = {}
    ;(reportsRes.data || []).forEach((r: any) => { if (r.host_id) reportedMap[r.host_id] = (reportedMap[r.host_id] || 0) + Number(r.duration_hours || 0) })

    const kasbonMap: Record<string, number> = {}
    ;(kasbonRes.data || []).forEach((k: any) => {
      const remaining = Number(k.amount) - Number(k.paid_amount || 0)
      kasbonMap[k.host_id] = (kasbonMap[k.host_id] || 0) + Math.max(0, remaining)
    })
    setKasbonByHost(kasbonMap)

    const adjMap: Record<string, { tunjangan: number; bonus: number; kasbonDibayar: number; pinalti: number }> = {}
    ;(adjRes.data || []).forEach((a: any) => {
      adjMap[a.host_id] = {
        tunjangan: Number(a.tunjangan) || 0, bonus: Number(a.bonus) || 0,
        kasbonDibayar: Number(a.kasbon_dibayar) || 0, pinalti: Number(a.pinalti) || 0,
      }
    })

    const excludedIds = new Set((exclRes.data || []).map((e: any) => e.host_id))

    const allRows: PayRow[] = (hostsRes.data || [])
      .map((h: any) => {
        const scheduledHours = scheduledMap[h.id] || 0
        const reportedHours = reportedMap[h.id] || 0
        const actualSalary = reportedHours * Number(h.hourly_rate || 0)
        const adj = adjMap[h.id] || { tunjangan: 0, bonus: 0, kasbonDibayar: 0, pinalti: 0 }
        return {
          host_id: h.id, full_name: h.full_name, username: h.username || null, hourly_rate: Number(h.hourly_rate) || 0,
          scheduledHours, forecastSalary: scheduledHours * Number(h.hourly_rate || 0),
          reportedHours, actualSalary,
          tunjangan: adj.tunjangan, bonus: adj.bonus, kasbonDibayar: adj.kasbonDibayar, pinalti: adj.pinalti,
          netSalary: actualSalary + adj.tunjangan + adj.bonus - adj.kasbonDibayar - adj.pinalti,
        }
      })
      .filter(r => r.scheduledHours > 0 || r.reportedHours > 0 || r.tunjangan > 0 || r.bonus > 0 || r.kasbonDibayar > 0 || r.pinalti > 0)

    setRows(allRows.filter(r => !excludedIds.has(r.host_id)))
    setExcludedRows(allRows.filter(r => excludedIds.has(r.host_id)))
    setLoading(false)
  }, [selectedPeriod])

  useEffect(() => { load() }, [load])

  const periods = useMemo(() => {
    // Always offer the last 12 pay periods regardless of whether there's data
    // yet — otherwise a period with no sessions could never be selected.
    const now = new Date()
    const generated = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 21)
      return getPayPeriod(d).start.toISOString().split('T')[0].slice(0, 7)
    })
    return Array.from(new Set([...generated, selectedPeriod])).sort().reverse()
  }, [selectedPeriod])

  const totalReportedHours = rows.reduce((s, r) => s + r.reportedHours, 0)
  const totalActualSalary = rows.reduce((s, r) => s + r.actualSalary, 0)
  const totalNetSalary = rows.reduce((s, r) => s + r.netSalary, 0)
  const totalKasbon = rows.reduce((s, r) => s + (kasbonByHost[r.host_id] || 0), 0)

  async function exportExcel() {
    const { utils, writeFile } = await import('xlsx')
    const ws = utils.json_to_sheet(rows.map(r => ({
      'Nama Host': r.full_name,
      'Tarif/Jam': r.hourly_rate,
      'Jam Terjadwal': Number(r.scheduledHours).toFixed(2),
      'Forecast Gaji': r.forecastSalary,
      'Jam Dilaporkan': Number(r.reportedHours).toFixed(2),
      'Gaji Aktual': r.actualSalary,
      'Tunjangan': r.tunjangan,
      'Bonus': r.bonus,
      'Bayar Kasbon': r.kasbonDibayar,
      'Pinalti': r.pinalti,
      'Gaji Bersih': r.netSalary,
      'Sisa Kasbon Belum Lunas': kasbonByHost[r.host_id] || 0,
      'Periode': periodLabel(periodStartStr),
    })))
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Payroll')
    writeFile(wb, `Payroll_${selectedPeriod}.xlsx`)
  }

  async function exportPDF(host: PayRow) {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text('New Wave Live Specialist', 14, 18)
    doc.setFontSize(12)
    doc.text('Slip Gaji', 14, 27)

    // Header info — no colored header row, just label/value pairs
    autoTable(doc, {
      startY: 34,
      body: [
        ['Periode', periodLabel(periodStartStr)],
        ['Nama', host.full_name],
        ['ID Host', host.username || '—'],
        ['Based Jam', formatCurrency(host.hourly_rate)],
        ['Based Content', formatCurrency(0)],
      ],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    })

    // Live — based on actual reported hours/sessions only, not the schedule plan
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY,
      body: [
        ['Live Total', `${Number(host.reportedHours).toFixed(2)} jam`],
        ['Konten Total', '0'],
        [{ content: 'Live Fee', styles: { fontStyle: 'bold' } }, { content: formatCurrency(host.actualSalary), styles: { fontStyle: 'bold' } }],
      ],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
      didParseCell: (data: any) => {
        if (data.row.index === 2) data.cell.styles.fillColor = [219, 234, 254]
      },
    })

    // Bonus & Tunjangan
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      head: [[{ content: 'Bonus & Tunjangan', colSpan: 2 }]],
      body: [
        ['Bonus Live', formatCurrency(host.bonus)],
        ['Tunjangan', formatCurrency(host.tunjangan)],
      ],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [219, 234, 254], textColor: [30, 64, 175], fontStyle: 'bold' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    })

    // Kasbon
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      head: [[{ content: 'Kasbon', colSpan: 2 }]],
      body: [
        ['Kasbon', formatCurrency(host.kasbonDibayar)],
        ['Potongan Lain', formatCurrency(host.pinalti)],
      ],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [254, 226, 226], textColor: [185, 28, 28], fontStyle: 'bold' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    })

    // Nett Take Home Pay
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      body: [[{ content: 'Nett Take Home Pay', styles: { fontStyle: 'bold', fontSize: 12 } },
              { content: formatCurrency(host.netSalary), styles: { fontStyle: 'bold', fontSize: 12 } }]],
      theme: 'grid',
      styles: { cellPadding: 5 },
      columnStyles: { 0: { cellWidth: 55 } },
    })

    doc.save(`Payslip_${host.full_name.replace(' ', '_')}_${selectedPeriod}.pdf`)
  }

  async function saveRate() {
    if (!editHost) return
    setSavingRate(true)
    const { error } = await createClient().from('profiles').update({ hourly_rate: editRate }).eq('id', editHost.host_id)
    setSavingRate(false)
    if (error) return
    const patch = (r: PayRow) => {
      if (r.host_id !== editHost.host_id) return r
      const actualSalary = r.reportedHours * editRate
      return {
        ...r, hourly_rate: editRate, forecastSalary: r.scheduledHours * editRate, actualSalary,
        netSalary: actualSalary + r.tunjangan + r.bonus - r.kasbonDibayar - r.pinalti,
      }
    }
    setRows(prev => prev.map(patch))
    setExcludedRows(prev => prev.map(patch))
    setEditHost(null)
  }

  // Update a row's Tunjangan/Bonus/Bayar Kasbon/Pinalti locally as the admin
  // types, recomputing Gaji Bersih immediately. Persisted on blur.
  function updateAdjField(hostId: string, field: 'tunjangan' | 'bonus' | 'kasbonDibayar' | 'pinalti', value: number) {
    const patch = (r: PayRow) => {
      if (r.host_id !== hostId) return r
      const next = { ...r, [field]: value }
      next.netSalary = next.actualSalary + next.tunjangan + next.bonus - next.kasbonDibayar - next.pinalti
      return next
    }
    setRows(prev => prev.map(patch))
    setExcludedRows(prev => prev.map(patch))
  }

  // Re-allocates this period's Bayar Kasbon amount across the host's
  // outstanding kasbon records (oldest first), undoing this period's prior
  // allocation first so edits stay consistent. Returns the amount actually
  // applied (capped at what's genuinely owed).
  async function applyKasbonPayment(hostId: string, amount: number): Promise<number> {
    const supabase = createClient()

    const { data: prevPayments } = await supabase.from('payroll_kasbon_payments')
      .select('id, kasbon_id, amount').eq('host_id', hostId).eq('period_start', periodStartStr)
    for (const p of prevPayments || []) {
      const { data: k } = await supabase.from('kasbon').select('amount, paid_amount').eq('id', p.kasbon_id).single()
      if (k) {
        const restored = Math.max(0, Number(k.paid_amount) - Number(p.amount))
        // Other periods' payments may have already covered it fully on their own.
        await supabase.from('kasbon').update({ paid_amount: restored, status: restored >= Number(k.amount) ? 'paid' : 'unpaid' }).eq('id', p.kasbon_id)
      }
    }
    await supabase.from('payroll_kasbon_payments').delete().eq('host_id', hostId).eq('period_start', periodStartStr)

    if (amount <= 0) return 0

    const { data: outstanding } = await supabase.from('kasbon')
      .select('id, amount, paid_amount').eq('host_id', hostId).eq('status', 'unpaid').order('created_at')

    let remaining = amount
    const newPayments: { host_id: string; period_start: string; kasbon_id: string; amount: number }[] = []
    for (const k of outstanding || []) {
      if (remaining <= 0) break
      const owed = Number(k.amount) - Number(k.paid_amount)
      const pay = Math.min(owed, remaining)
      if (pay <= 0) continue
      const newPaidAmount = Number(k.paid_amount) + pay
      const fullyPaid = newPaidAmount >= Number(k.amount)
      await supabase.from('kasbon').update({
        paid_amount: newPaidAmount, status: fullyPaid ? 'paid' : 'unpaid',
        ...(fullyPaid ? { paid_at: new Date().toISOString() } : {}),
      }).eq('id', k.id)
      newPayments.push({ host_id: hostId, period_start: periodStartStr, kasbon_id: k.id, amount: pay })
      remaining -= pay
    }
    if (newPayments.length) await supabase.from('payroll_kasbon_payments').insert(newPayments)
    return amount - remaining
  }

  async function persistRow(row: PayRow) {
    await createClient().from('payroll_adjustments').upsert({
      host_id: row.host_id, period_start: periodStartStr,
      tunjangan: row.tunjangan, bonus: row.bonus, kasbon_dibayar: row.kasbonDibayar, pinalti: row.pinalti,
    }, { onConflict: 'host_id,period_start' })

    const applied = await applyKasbonPayment(row.host_id, row.kasbonDibayar)
    if (applied !== row.kasbonDibayar) {
      // Entered more than what was actually owed — clamp to what was applied and re-save.
      updateAdjField(row.host_id, 'kasbonDibayar', applied)
      await createClient().from('payroll_adjustments')
        .update({ kasbon_dibayar: applied }).eq('host_id', row.host_id).eq('period_start', periodStartStr)
    }
    // Outstanding kasbon balances shifted — refresh the reference map.
    const { data: kasbonRows } = await createClient().from('kasbon').select('host_id, amount, paid_amount').eq('status', 'unpaid')
    const kasbonMap: Record<string, number> = {}
    ;(kasbonRows || []).forEach((k: any) => {
      const remaining = Number(k.amount) - Number(k.paid_amount || 0)
      kasbonMap[k.host_id] = (kasbonMap[k.host_id] || 0) + Math.max(0, remaining)
    })
    setKasbonByHost(kasbonMap)
  }

  async function openDetail(row: PayRow) {
    setDetailHost(row)
    setDetailLoading(true)
    const supabase = createClient()
    const [slotsRes, reportsRes] = await Promise.all([
      supabase.from('schedule_slots')
        .select('id, slot_date, session_no, jam_mulai, durasi, brand, platform')
        .eq('host_id', row.host_id).gte('slot_date', periodStartStr).lte('slot_date', periodEndStr)
        .order('slot_date').order('session_no'),
      supabase.from('live_reports')
        .select('slot_id, gmv, impression, viewer, trans, comment_count')
        .eq('host_id', row.host_id).gte('report_date', periodStartStr).lte('report_date', periodEndStr),
    ])
    const reportBySlot: Record<string, any> = {}
    ;(reportsRes.data || []).forEach((r: any) => { if (r.slot_id) reportBySlot[r.slot_id] = r })

    const detail: SessionDetailRow[] = (slotsRes.data || []).map((s: any) => {
      const report = reportBySlot[s.id]
      return {
        slot_id: s.id, date: s.slot_date,
        time: s.jam_mulai ? s.jam_mulai.slice(0, 5) : `${String(s.session_no - 1).padStart(2, '0')}:00`,
        hour: Number(s.durasi) || 0, brand: s.brand || '—', platform: s.platform || '—',
        hasReport: !!report,
        gmv: Number(report?.gmv) || 0, impression: Number(report?.impression) || 0,
        viewer: Number(report?.viewer) || 0, trans: Number(report?.trans) || 0,
        comment_count: Number(report?.comment_count) || 0,
      }
    })
    setDetailRows(detail)
    setDetailLoading(false)
  }

  async function excludeHost(hostId: string) {
    await createClient().from('payroll_exclusions').insert({ host_id: hostId, period_start: periodStartStr })
    const row = rows.find(r => r.host_id === hostId)
    setRows(prev => prev.filter(r => r.host_id !== hostId))
    if (row) setExcludedRows(prev => [...prev, row])
    setConfirmExcludeId(null)
  }

  async function restoreHost(hostId: string) {
    await createClient().from('payroll_exclusions').delete().eq('host_id', hostId).eq('period_start', periodStartStr)
    const row = excludedRows.find(r => r.host_id === hostId)
    setExcludedRows(prev => prev.filter(r => r.host_id !== hostId))
    if (row) setRows(prev => [...prev, row])
  }

  if (loading) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-400">Memuat data gaji...</div>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">Periode: 21 – 20 tiap bulan</p>
        <div className="flex items-center gap-3">
          <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
            {periods.map(p => (
              <option key={p} value={p}>{periodLabel(p + '-21')}</option>
            ))}
          </select>
          <button onClick={exportExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            <Download size={14}/> Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Host', value: `${rows.length}` },
          { label: 'Total Jam Dilaporkan', value: `${Number(totalReportedHours.toFixed(1))} jam` },
          { label: 'Total Gaji Aktual', value: formatCurrency(totalActualSalary) },
          { label: 'Total Gaji Bersih', value: formatCurrency(totalNetSalary) },
          { label: 'Sisa Kasbon Belum Lunas', value: formatCurrency(totalKasbon) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {excludedRows.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
          <span className="text-gray-400">{excludedRows.length} host disembunyikan periode ini:</span>
          {excludedRows.map(r => (
            <button key={r.host_id} onClick={() => restoreHost(r.host_id)}
              className="flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2.5 py-1 text-gray-600 hover:border-brand-400 hover:text-brand-700 transition-colors">
              {r.full_name} <span className="text-brand-500 font-semibold">↺ Tampilkan</span>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Belum ada data gaji untuk periode ini</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-semibold sticky left-0 z-20 bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">Nama Host</th>
                <th className="px-4 py-3 text-right font-semibold">Tarif/Jam</th>
                <th className="px-4 py-3 text-right font-semibold">Jam Terjadwal</th>
                <th className="px-4 py-3 text-right font-semibold">Forecast Gaji</th>
                <th className="px-4 py-3 text-right font-semibold">Jam Dilaporkan</th>
                <th className="px-4 py-3 text-right font-semibold">Gaji Aktual</th>
                <th className="px-4 py-3 text-right font-semibold">Tunjangan</th>
                <th className="px-4 py-3 text-right font-semibold">Bonus</th>
                <th className="px-4 py-3 text-right font-semibold">Bayar Kasbon</th>
                <th className="px-4 py-3 text-right font-semibold">Pinalti</th>
                <th className="px-4 py-3 text-right font-semibold">Gaji Bersih</th>
                <th className="px-4 py-3 text-center font-semibold w-40">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(row => (
                <tr key={row.host_id} className="group hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => openDetail(row)}>
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">{row.full_name}</td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{formatCurrency(row.hourly_rate)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{row.scheduledHours.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(row.forecastSalary)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{row.reportedHours.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">{formatCurrency(row.actualSalary)}</td>
                  <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                    <CurrencyInput value={row.tunjangan}
                      onChange={v => updateAdjField(row.host_id, 'tunjangan', v)} onBlur={() => persistRow(row)}
                      wrapperClassName="flex items-center border border-transparent hover:border-gray-200 focus-within:border-brand-400 rounded-lg overflow-hidden"
                      prefixClassName="px-1.5 py-1 bg-gray-50 text-[10px] font-semibold text-gray-400 flex-shrink-0"
                      className="w-20 min-w-0 px-1.5 py-1 text-xs text-right text-emerald-600 focus:outline-none bg-transparent"/>
                  </td>
                  <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                    <CurrencyInput value={row.bonus}
                      onChange={v => updateAdjField(row.host_id, 'bonus', v)} onBlur={() => persistRow(row)}
                      wrapperClassName="flex items-center border border-transparent hover:border-gray-200 focus-within:border-brand-400 rounded-lg overflow-hidden"
                      prefixClassName="px-1.5 py-1 bg-gray-50 text-[10px] font-semibold text-gray-400 flex-shrink-0"
                      className="w-20 min-w-0 px-1.5 py-1 text-xs text-right text-emerald-600 focus:outline-none bg-transparent"/>
                  </td>
                  <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                    <CurrencyInput value={row.kasbonDibayar}
                      onChange={v => updateAdjField(row.host_id, 'kasbonDibayar', v)} onBlur={() => persistRow(row)}
                      wrapperClassName="flex items-center border border-transparent hover:border-gray-200 focus-within:border-brand-400 rounded-lg overflow-hidden"
                      prefixClassName="px-1.5 py-1 bg-gray-50 text-[10px] font-semibold text-gray-400 flex-shrink-0"
                      className="w-20 min-w-0 px-1.5 py-1 text-xs text-right text-red-500 focus:outline-none bg-transparent"/>
                  </td>
                  <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                    <CurrencyInput value={row.pinalti}
                      onChange={v => updateAdjField(row.host_id, 'pinalti', v)} onBlur={() => persistRow(row)}
                      wrapperClassName="flex items-center border border-transparent hover:border-gray-200 focus-within:border-brand-400 rounded-lg overflow-hidden"
                      prefixClassName="px-1.5 py-1 bg-gray-50 text-[10px] font-semibold text-gray-400 flex-shrink-0"
                      className="w-20 min-w-0 px-1.5 py-1 text-xs text-right text-red-500 focus:outline-none bg-transparent"/>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{formatCurrency(row.netSalary)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    {confirmExcludeId === row.host_id ? (
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-[10px] text-gray-500">Sembunyikan?</span>
                        <button onClick={() => excludeHost(row.host_id)}
                          className="text-[10px] bg-red-500 text-white px-2 py-1 rounded-lg font-semibold">Ya</button>
                        <button onClick={() => setConfirmExcludeId(null)}
                          className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-semibold">Batal</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => { setEditHost(row); setEditRate(row.hourly_rate) }} title="Edit Tarif/Jam"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
                          <Edit2 size={13}/>
                        </button>
                        <button onClick={() => setConfirmExcludeId(row.host_id)} title="Sembunyikan dari periode ini"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={13}/>
                        </button>
                        <button onClick={() => exportPDF(row)} title="Generate Slip Gaji"
                          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium border border-brand-200 rounded-lg px-2 py-1 hover:bg-brand-50 transition-colors">
                          <FileText size={12}/> Slip
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Edit hourly rate */}
      {editHost && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditHost(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-gray-900 text-sm">Edit Tarif/Jam — {editHost.full_name}</p>
              <button onClick={() => setEditHost(null)}><X size={16} className="text-gray-400"/></button>
            </div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Tarif per Jam (Rp)</label>
            <CurrencyInput value={editRate} onChange={setEditRate}/>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditHost(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">Batal</button>
              <button onClick={saveRate} disabled={savingRate}
                className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-60">
                {savingRate ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session detail popup */}
      {detailHost && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetailHost(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <p className="font-bold text-gray-900 text-sm">{detailHost.full_name}</p>
                <p className="text-xs text-gray-400">{periodLabel(periodStartStr)}</p>
              </div>
              <button onClick={() => setDetailHost(null)}><X size={18} className="text-gray-400"/></button>
            </div>
            <div className="overflow-auto">
              {detailLoading ? (
                <div className="p-10 text-center text-sm text-gray-400">Memuat...</div>
              ) : detailRows.length === 0 ? (
                <div className="p-10 text-center text-sm text-gray-400">Tidak ada sesi terjadwal pada periode ini</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">Tanggal</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Jam</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Durasi</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Brand</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Platform</th>
                      <th className="px-4 py-2.5 text-center font-semibold">Report</th>
                      <th className="px-4 py-2.5 text-right font-semibold">GMV</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Impresi</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Penonton</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Transaksi</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Komentar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {detailRows.map(r => (
                      <tr key={r.slot_id} className={!r.hasReport ? 'bg-red-50/30' : ''}>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{fmtShortDate(r.date)}</td>
                        <td className="px-4 py-2.5 text-gray-600">{r.time}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{r.hour.toFixed(1)}j</td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{r.brand}</td>
                        <td className="px-4 py-2.5 text-gray-600">{r.platform}</td>
                        <td className="px-4 py-2.5 text-center">
                          {r.hasReport
                            ? <span className="text-emerald-600 font-bold">✓</span>
                            : <span className="text-red-400 font-bold">✕</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-emerald-700 whitespace-nowrap">{r.hasReport ? formatCurrency(r.gmv) : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{r.hasReport ? r.impression : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{r.hasReport ? r.viewer : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{r.hasReport ? r.trans : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{r.hasReport ? r.comment_count : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Kasbon Tab ────────────────────────────────────────────────────────────────
interface KasbonFull extends Kasbon {
  requested_amount?: number | null
  request_status?: string | null
  request_note?: string | null
  approved_at?: string | null
  paid_amount?: number | null
}

function KasbonTab() {
  const [hosts, setHosts] = useState<{ id: string; full_name: string }[]>([])
  const [kasbons, setKasbons] = useState<KasbonFull[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ host_id: '', amount: 0, reason: '' })
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all')
  // Per-request approve state: { [id]: approveAmount }
  const [approveAmounts, setApproveAmounts] = useState<Record<string, string>>({})
  const [actioningId, setActioningId] = useState<string | null>(null)

  function load() {
    const supabase = createClient()
    Promise.all([
      supabase.from('profiles').select('id, full_name').in('role', ['host', 'host_manager']).order('full_name'),
      supabase.from('kasbon').select('*').order('created_at', { ascending: false }),
    ]).then(([h, k]) => {
      setHosts(h.data || [])
      const rows = (k.data as KasbonFull[]) || []
      setKasbons(rows)
      // Pre-fill approve amounts with requested values
      const init: Record<string, string> = {}
      rows.forEach(r => { if (r.request_status === 'pending') init[r.id] = String(r.requested_amount ?? r.amount) })
      setApproveAmounts(init)
      setLoading(false)
    })
  }
  useEffect(load, [])

  async function addKasbon() {
    if (!form.host_id || form.amount <= 0) return
    setSaving(true)
    const { data, error } = await createClient().from('kasbon').insert({
      host_id: form.host_id, amount: Number(form.amount), reason: form.reason || null, status: 'unpaid',
    }).select().single()
    setSaving(false)
    if (!error && data) {
      setKasbons(prev => [data as KasbonFull, ...prev])
      setForm({ host_id: '', amount: 0, reason: '' }); setAdding(false)
    } else if (error) {
      alert('Gagal simpan kasbon: ' + error.message)
    }
  }

  async function approveRequest(k: KasbonFull) {
    const approvedAmt = Number(approveAmounts[k.id] || k.requested_amount || k.amount)
    if (!approvedAmt || approvedAmt <= 0) return
    setActioningId(k.id)
    await createClient().from('kasbon').update({
      amount: approvedAmt,
      request_status: 'approved',
      approved_at: new Date().toISOString(),
      status: 'unpaid',
    }).eq('id', k.id)
    setKasbons(prev => prev.map(x => x.id === k.id
      ? { ...x, amount: approvedAmt, request_status: 'approved', approved_at: new Date().toISOString() }
      : x))
    setActioningId(null)
  }

  async function rejectRequest(k: KasbonFull) {
    setActioningId(k.id)
    await createClient().from('kasbon').update({ request_status: 'rejected' }).eq('id', k.id)
    setKasbons(prev => prev.map(x => x.id === k.id ? { ...x, request_status: 'rejected' } : x))
    setActioningId(null)
  }

  async function togglePaid(k: KasbonFull) {
    const next = k.status === 'paid' ? 'unpaid' : 'paid'
    const { error } = await createClient().from('kasbon')
      .update({ status: next, paid_at: next === 'paid' ? new Date().toISOString() : null })
      .eq('id', k.id)
    if (!error) setKasbons(prev => prev.map(x => x.id === k.id ? { ...x, status: next } : x))
  }

  async function remove(id: string) {
    if (!confirm('Hapus kasbon ini?')) return
    await createClient().from('kasbon').delete().eq('id', id)
    setKasbons(prev => prev.filter(x => x.id !== id))
  }

  const nameOf = (id: string) => hosts.find(h => h.id === id)?.full_name || '—'
  const pending = kasbons.filter(k => k.request_status === 'pending')
  const nonPending = kasbons.filter(k => k.request_status !== 'pending')
  const filtered = nonPending.filter(k => filter === 'all' ? true : k.status === filter)
  const totalUnpaid = nonPending.filter(k => k.status === 'unpaid' && k.request_status !== 'rejected')
    .reduce((s, k) => s + Math.max(0, Number(k.amount) - Number(k.paid_amount || 0)), 0)

  if (loading) return <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-400">Memuat kasbon...</div>

  return (
    <div className="space-y-5">
      {/* Pending requests notification */}
      {pending.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"/>
            <p className="text-sm font-bold text-amber-800">{pending.length} Request Kasbon Masuk</p>
          </div>
          <div className="divide-y divide-gray-50">
            {pending.map(k => (
              <div key={k.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{nameOf(k.host_id)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(k.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {(k.request_note || k.reason) && (
                      <p className="text-xs text-gray-600 mt-1 italic">"{k.request_note || k.reason}"</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Diajukan: <span className="font-bold text-gray-900">{formatCurrency(Number(k.requested_amount || k.amount))}</span>
                    </p>
                  </div>
                </div>
                {/* Approve with editable amount */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">ACC Nominal:</span>
                    <CurrencyInput
                      value={Number(approveAmounts[k.id] ?? k.requested_amount ?? k.amount)}
                      onChange={v => setApproveAmounts(a => ({ ...a, [k.id]: String(v) }))}
                      wrapperClassName="flex items-center border border-gray-200 rounded-xl overflow-hidden flex-1 min-w-0 focus-within:ring-2 focus-within:ring-brand-400"
                      className="px-2 py-2 text-sm flex-1 min-w-0 focus:outline-none rounded-r-xl"/>
                  </div>
                  <button onClick={() => approveRequest(k)} disabled={actioningId === k.id}
                    className="flex items-center gap-1 bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-emerald-700 disabled:opacity-60 flex-shrink-0">
                    <CheckCircle size={12}/> ACC
                  </button>
                  <button onClick={() => rejectRequest(k)} disabled={actioningId === k.id}
                    className="flex items-center gap-1 bg-red-100 text-red-600 text-xs font-bold px-3 py-2 rounded-xl hover:bg-red-200 disabled:opacity-60 flex-shrink-0">
                    <XCircle size={12}/> Tolak
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Kasbon', value: `${nonPending.length}` },
          { label: 'Belum Lunas', value: `${nonPending.filter(k => k.status === 'unpaid' && k.request_status !== 'rejected').length}` },
          { label: 'Sisa Hutang', value: formatCurrency(totalUnpaid) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
            <p className="text-lg font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {(['all', 'unpaid', 'paid'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {f === 'all' ? 'Semua' : f === 'unpaid' ? 'Belum Lunas' : 'Lunas'}
            </button>
          ))}
        </div>
        <button onClick={() => setAdding(a => !a)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Plus size={14}/> Tambah Kasbon
        </button>
      </div>

      {adding && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Host</label>
              <select value={form.host_id} onChange={e => setForm(f => ({ ...f, host_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                <option value="">— Pilih host —</option>
                {hosts.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Jumlah (Rp)</label>
              <CurrencyInput value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))}
                placeholder="500.000"/>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Keterangan</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Kasbon transport, dll"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addKasbon} disabled={saving || !form.host_id || form.amount <= 0}
              className="bg-brand-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan Kasbon'}
            </button>
            <button onClick={() => { setAdding(false); setForm({ host_id: '', amount: 0, reason: '' }) }}
              className="px-4 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Batal</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Belum ada kasbon</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-semibold">Host</th>
                <th className="px-4 py-3 text-left font-semibold">Keterangan</th>
                <th className="px-4 py-3 text-left font-semibold">Tanggal</th>
                <th className="px-4 py-3 text-right font-semibold">Jumlah</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
                <th className="px-4 py-3 text-center font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(k => (
                <tr key={k.id} className={`hover:bg-gray-50 transition-colors ${k.request_status === 'rejected' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {nameOf(k.host_id)}
                    {k.request_status === 'approved' && k.requested_amount && Number(k.requested_amount) !== Number(k.amount) && (
                      <span className="block text-[10px] font-normal text-gray-400">Req: {formatCurrency(Number(k.requested_amount))}</span>
                    )}
                    {k.request_status === 'rejected' && (
                      <span className="block text-[10px] font-normal text-red-400">Ditolak</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{k.reason || k.request_note || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(k.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {formatCurrency(Number(k.amount))}
                    {k.status === 'unpaid' && Number(k.paid_amount || 0) > 0 && (
                      <span className="block text-[10px] font-normal text-emerald-600">
                        Terbayar {formatCurrency(Number(k.paid_amount))} · Sisa {formatCurrency(Number(k.amount) - Number(k.paid_amount || 0))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {k.request_status !== 'rejected' && (
                      <button onClick={() => togglePaid(k)}
                        className={`text-xs font-bold px-2.5 py-1 rounded-full transition-colors ${
                          k.status === 'paid' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        }`}>
                        {k.status === 'paid' ? 'Lunas' : 'Belum Lunas'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => remove(k.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <Wallet size={12}/> Sisa hutang (belum lunas) otomatis dipotong di tab Gaji.
      </p>
    </div>
  )
}

// ── Absensi Ops Tab ───────────────────────────────────────────────────────────
interface AttendanceRow {
  id: string; operator_id: string; date: string
  clock_in: string | null; clock_in_photo_url: string | null
  clock_out: string | null; clock_out_photo_url: string | null
}
interface LemburRow {
  id: string; operator_id: string; date: string; hours: number; reason: string | null
  request_status: string; created_at: string
}

function fmtShortDateFull(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtClockTime(iso: string) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function AbsensiOpsTab() {
  const [operators, setOperators] = useState<{ id: string; full_name: string }[]>([])
  const [attendance, setAttendance] = useState<AttendanceRow[]>([])
  const [lemburs, setLemburs] = useState<LemburRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOp, setSelectedOp] = useState('')
  const [actioningId, setActioningId] = useState<string | null>(null)

  const load = useCallback(() => {
    const supabase = createClient()
    const since = new Date(); since.setDate(since.getDate() - 30)
    const sinceStr = toLocalDateStr(since)
    Promise.all([
      supabase.from('profiles').select('id, full_name').eq('role', 'operator').order('full_name'),
      supabase.from('attendance').select('*').gte('date', sinceStr).order('date', { ascending: false }),
      supabase.from('lembur_requests').select('*').order('created_at', { ascending: false }),
    ]).then(([opRes, attRes, lemburRes]) => {
      setOperators(opRes.data || [])
      setAttendance((attRes.data as AttendanceRow[]) || [])
      setLemburs((lemburRes.data as LemburRow[]) || [])
      setLoading(false)
    })
  }, [])
  useEffect(load, [load])

  async function approveLembur(l: LemburRow) {
    setActioningId(l.id)
    await createClient().from('lembur_requests').update({
      request_status: 'approved', approved_at: new Date().toISOString(),
    }).eq('id', l.id)
    setLemburs(prev => prev.map(x => x.id === l.id ? { ...x, request_status: 'approved' } : x))
    setActioningId(null)
  }
  async function rejectLembur(l: LemburRow) {
    setActioningId(l.id)
    await createClient().from('lembur_requests').update({ request_status: 'rejected' }).eq('id', l.id)
    setLemburs(prev => prev.map(x => x.id === l.id ? { ...x, request_status: 'rejected' } : x))
    setActioningId(null)
  }

  const nameOf = (id: string) => operators.find(o => o.id === id)?.full_name || '—'
  const pendingLembur = lemburs.filter(l => l.request_status === 'pending')
  const filteredAttendance = attendance.filter(a => !selectedOp || a.operator_id === selectedOp)

  if (loading) return <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-400">Memuat absensi...</div>

  return (
    <div className="space-y-5">
      {/* Pending Lembur requests */}
      {pendingLembur.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"/>
            <p className="text-sm font-bold text-amber-800">{pendingLembur.length} Request Lembur Masuk</p>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingLembur.map(l => (
              <div key={l.id} className="px-4 py-4 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-bold text-gray-900 text-sm">{nameOf(l.operator_id)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtShortDateFull(l.date)} · {l.hours} jam</p>
                  {l.reason && <p className="text-xs text-gray-600 mt-1 italic">"{l.reason}"</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => approveLembur(l)} disabled={actioningId === l.id}
                    className="flex items-center gap-1 bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                    <CheckCircle size={12}/> ACC
                  </button>
                  <button onClick={() => rejectLembur(l)} disabled={actioningId === l.id}
                    className="flex items-center gap-1 bg-red-100 text-red-600 text-xs font-bold px-3 py-2 rounded-xl hover:bg-red-200 disabled:opacity-60">
                    <XCircle size={12}/> Tolak
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <select value={selectedOp} onChange={e => setSelectedOp(e.target.value)}
        className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white min-w-[180px]">
        <option value="">Semua Operator</option>
        {operators.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
      </select>

      {/* Attendance table */}
      {filteredAttendance.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          Belum ada data absensi
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Tanggal</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Operator</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Masuk</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Keluar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredAttendance.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtShortDateFull(a.date)}</td>
                    <td className="px-3 py-3 text-xs font-bold text-brand-700 whitespace-nowrap">{nameOf(a.operator_id)}</td>
                    <td className="px-3 py-3">
                      {a.clock_in ? (
                        <div className="flex items-center gap-2">
                          {a.clock_in_photo_url ? (
                            <button onClick={() => window.open(a.clock_in_photo_url!, '_blank')}>
                              <img src={a.clock_in_photo_url} alt="Masuk" className="w-8 h-8 rounded-lg object-cover border border-emerald-200 hover:border-emerald-400"/>
                            </button>
                          ) : (
                            <Camera size={14} className="text-gray-300"/>
                          )}
                          <span className="text-xs font-semibold text-emerald-700">{fmtClockTime(a.clock_in)}</span>
                        </div>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {a.clock_out ? (
                        <div className="flex items-center gap-2">
                          {a.clock_out_photo_url ? (
                            <button onClick={() => window.open(a.clock_out_photo_url!, '_blank')}>
                              <img src={a.clock_out_photo_url} alt="Keluar" className="w-8 h-8 rounded-lg object-cover border border-blue-200 hover:border-blue-400"/>
                            </button>
                          ) : (
                            <Camera size={14} className="text-gray-300"/>
                          )}
                          <span className="text-xs font-semibold text-blue-700">{fmtClockTime(a.clock_out)}</span>
                        </div>
                      ) : a.clock_in ? (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 w-fit"><Clock size={9}/>Belum keluar</span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lembur history */}
      <div>
        <p className="text-sm font-bold text-gray-900 mb-2">Riwayat Lembur</p>
        {lemburs.filter(l => l.request_status !== 'pending').length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-400">
            Belum ada riwayat lembur
          </div>
        ) : (
          <div className="space-y-2">
            {lemburs.filter(l => l.request_status !== 'pending').map(l => (
              <div key={l.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-900 text-sm">{nameOf(l.operator_id)}</p>
                  <p className="text-xs text-gray-400">{fmtShortDateFull(l.date)} · {l.hours} jam{l.reason ? ` · ${l.reason}` : ''}</p>
                </div>
                {l.request_status === 'approved' ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 flex-shrink-0"><CheckCircle size={9}/>Disetujui</span>
                ) : (
                  <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 flex-shrink-0"><XCircle size={9}/>Ditolak</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main HRD Page ─────────────────────────────────────────────────────────────
export default function HRDClient({ profile }: { profile: any }) {
  const { lang } = useLang()
  const [tab, setTab] = useState<Tab>('hosts')

  return (
    <AppShell role="superadmin" userName={profile.full_name}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{tr('hrd', lang)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{tr('hrdDesc', lang)}</p>
          </div>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit flex-wrap">
          {(['hosts', 'gaji', 'kasbon', 'pettycash', 'absensi'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'hosts' ? 'Data Host' : t === 'gaji' ? 'Gaji' : t === 'kasbon' ? 'Kasbon' : t === 'pettycash' ? 'Petty Cash' : 'Absensi Ops'}
            </button>
          ))}
        </div>

        {tab === 'hosts' ? <HostListTab/> : tab === 'gaji' ? <GajiTab/> : tab === 'kasbon' ? <KasbonTab/> : tab === 'pettycash' ? <PettyCashPanel/> : <AbsensiOpsTab/>}
      </div>
    </AppShell>
  )
}
