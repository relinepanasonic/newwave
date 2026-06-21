'use client'
import { useState, useEffect, useMemo } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { Download, ExternalLink, Save, X, Edit2, Ban, CheckCircle, FileText } from 'lucide-react'
import { formatCurrency, getPayPeriod } from '@/lib/utils'

type Tab = 'hosts' | 'gaji'

interface Host {
  id: string
  full_name: string
  phone?: string
  alamat?: string
  nik_id?: string
  ktp_photo_url?: string
  gdrive_ktp_url?: string
  tipe_host?: string
  target_hours?: number
  is_active?: boolean
  created_at: string
}

interface PayRow {
  host_id: string; full_name: string; hourly_rate: number
  period_start: string; total_hours: number; total_salary: number; session_count: number
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

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles')
      .select('id, full_name, phone, alamat, nik_id, ktp_photo_url, gdrive_ktp_url, tipe_host, target_hours, is_active, created_at')
      .eq('role', 'host')
      .order('full_name')
      .then(({ data }) => {
        setHosts(data || [])
        setLoading(false)
      })
  }, [])

  function startEdit(host: Host) {
    setEditingId(host.id)
    setEditValues({ gdrive_ktp_url: host.gdrive_ktp_url || '', phone: host.phone || '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValues({})
  }

  async function saveEdit(hostId: string) {
    setSaving(true)
    const { error } = await createClient().from('profiles')
      .update({ gdrive_ktp_url: editValues.gdrive_ktp_url || null, phone: editValues.phone || null })
      .eq('id', hostId)
    setSaving(false)
    if (!error) {
      setHosts(prev => prev.map(h => h.id === hostId ? { ...h, ...editValues } : h))
      setEditingId(null)
    }
  }

  async function toggleBlock(host: Host) {
    const newActive = !host.is_active
    setBlockingId(host.id)
    const { error } = await createClient().from('profiles')
      .update({ is_active: newActive })
      .eq('id', host.id)
    setBlockingId(null)
    if (!error) {
      setHosts(prev => prev.map(h => h.id === host.id ? { ...h, is_active: newActive } : h))
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
                        <p className="font-semibold text-gray-900">{host.full_name}</p>
                        {host.phone && <p className="text-[10px] text-gray-400">{host.phone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          isBlocked ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isBlocked ? 'Nonaktif' : 'Aktif'}
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
                              <button
                                onClick={() => toggleBlock(host)}
                                disabled={blockingId === host.id}
                                title={isBlocked ? 'Aktifkan kembali' : 'Blokir akses'}
                                className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                                  isBlocked
                                    ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                                    : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600'
                                }`}>
                                {isBlocked ? <CheckCircle size={13}/> : <Ban size={13}/>}
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
    </div>
  )
}

// ── Gaji Tab ──────────────────────────────────────────────────────────────────
function GajiTab() {
  const [summary, setSummary] = useState<PayRow[]>([])
  const [loading, setLoading] = useState(true)
  const currentPeriod = getPayPeriod()
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod.start.toISOString().split('T')[0].slice(0, 7))

  useEffect(() => {
    createClient().from('payroll_summary').select('*')
      .then(({ data }) => {
        setSummary(data || [])
        setLoading(false)
      })
  }, [])

  const periods = useMemo(() => {
    const ps = Array.from(new Set(summary.map((r: PayRow) => r.period_start.slice(0, 7))))
    if (!ps.includes(selectedPeriod)) ps.unshift(selectedPeriod)
    return ps.sort().reverse()
  }, [summary, selectedPeriod])

  const filtered = summary.filter((r: PayRow) => r.period_start.slice(0, 7) === selectedPeriod)
  const totalPay = filtered.reduce((s, r) => s + Number(r.total_salary), 0)
  const totalHours = filtered.reduce((s, r) => s + Number(r.total_hours), 0)

  async function exportExcel() {
    const { utils, writeFile } = await import('xlsx')
    const ws = utils.json_to_sheet(filtered.map(r => ({
      'Nama Host': r.full_name,
      'Tarif/Jam': r.hourly_rate,
      'Total Jam': Number(r.total_hours).toFixed(2),
      'Sesi': r.session_count,
      'Total Gaji': Number(r.total_salary),
      'Periode': periodLabel(r.period_start),
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
    doc.text('New Wave Live Specialist', 14, 20)
    doc.setFontSize(11)
    doc.text('Slip Gaji / Payslip', 14, 30)
    doc.text(`Nama: ${host.full_name}`, 14, 42)
    doc.text(`Periode: ${periodLabel(host.period_start)}`, 14, 50)
    doc.text(`Tarif/Jam: ${formatCurrency(host.hourly_rate)}`, 14, 58)
    autoTable(doc, {
      startY: 68,
      head: [['Keterangan', 'Nilai']],
      body: [
        ['Total Sesi', String(host.session_count)],
        ['Total Jam Kerja', `${Number(host.total_hours).toFixed(2)} jam`],
        ['Tarif per Jam', formatCurrency(host.hourly_rate)],
        ['Total Gaji', formatCurrency(Number(host.total_salary))],
      ],
      theme: 'grid',
      headStyles: { fillColor: [109, 40, 217] },
    })
    doc.save(`Payslip_${host.full_name.replace(' ', '_')}_${selectedPeriod}.pdf`)
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

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Host', value: `${filtered.length}` },
          { label: 'Total Jam', value: `${Number(totalHours.toFixed(1))} jam` },
          { label: 'Total Gaji', value: formatCurrency(totalPay) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Belum ada data gaji untuk periode ini</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-semibold">Nama Host</th>
                <th className="px-4 py-3 text-right font-semibold">Sesi</th>
                <th className="px-4 py-3 text-right font-semibold">Jam Kerja</th>
                <th className="px-4 py-3 text-right font-semibold">Tarif/Jam</th>
                <th className="px-4 py-3 text-right font-semibold">Total Gaji</th>
                <th className="px-4 py-3 text-center font-semibold">Payslip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(row => (
                <tr key={row.host_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900">{row.full_name}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{row.session_count}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{Number(row.total_hours).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(row.hourly_rate)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(Number(row.total_salary))}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => exportPDF(row)}
                      className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 font-medium border border-brand-200 rounded-lg px-2.5 py-1 hover:bg-brand-50 transition-colors">
                      <FileText size={12}/> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Main HRD Page ─────────────────────────────────────────────────────────────
export default function HRDClient({ profile }: { profile: any }) {
  const [tab, setTab] = useState<Tab>('hosts')

  return (
    <AppShell role="superadmin" userName={profile.full_name}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">HRD</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manajemen host & penggajian</p>
          </div>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
          {(['hosts', 'gaji'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'hosts' ? 'Data Host' : 'Gaji'}
            </button>
          ))}
        </div>

        {tab === 'hosts' ? <HostListTab/> : <GajiTab/>}
      </div>
    </AppShell>
  )
}
