'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { Download, ExternalLink, Save, X, Edit2 } from 'lucide-react'

interface Host {
  id: string
  full_name: string
  email?: string
  phone?: string
  alamat?: string
  nik_id?: string
  ktp_photo_url?: string
  gdrive_ktp_url?: string
  tipe_host?: string
  target_hours?: number
  created_at: string
}

export default function HRDClient({ profile }: { profile: any }) {
  const [hosts, setHosts] = useState<Host[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<Host>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles')
      .select('id, full_name, email, phone, alamat, nik_id, ktp_photo_url, gdrive_ktp_url, tipe_host, target_hours, created_at')
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
    const supabase = createClient()
    const { error } = await supabase.from('profiles')
      .update({ gdrive_ktp_url: editValues.gdrive_ktp_url || null, phone: editValues.phone || null })
      .eq('id', hostId)
    setSaving(false)
    if (!error) {
      setHosts(prev => prev.map(h => h.id === hostId ? { ...h, ...editValues } : h))
      setEditingId(null)
    }
  }

  function downloadCSV() {
    const headers = ['No', 'Nama', 'Tipe Host', 'No HP', 'Alamat', 'NIK', 'Link KTP (Supabase)', 'Link Foto GDrive', 'Target Jam', 'Bergabung']
    const rows = hosts.map((h, i) => [
      i + 1,
      h.full_name,
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

  return (
    <AppShell role="superadmin" userName={profile.full_name}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">HRD — Data Host</h1>
            <p className="text-sm text-gray-500 mt-0.5">Data onboarding semua host · {hosts.length} host terdaftar</p>
            <a href="https://drive.google.com/drive/folders/16J8ZA8R0nc0IshWnJpKv1a0mhksZ44ji?usp=sharing"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-xs text-brand-600 hover:underline font-medium">
              <ExternalLink size={12}/> Buka Folder Google Drive KTP
            </a>
          </div>
          <button onClick={downloadCSV}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors">
            <Download size={14}/> Download CSV
          </button>
        </div>

        {/* Table */}
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
                    <th className="px-4 py-3 text-left font-semibold min-w-[100px]">Tipe</th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[110px]">No HP</th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Alamat</th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[140px]">NIK</th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[80px]">Foto KTP</th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Link GDrive</th>
                    <th className="px-4 py-3 text-left font-semibold w-12">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {hosts.map((host, idx) => (
                    <tr key={host.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{host.full_name}</p>
                        {host.email && <p className="text-[10px] text-gray-400">{host.email}</p>}
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
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[180px]">
                        <span className="line-clamp-2">{host.alamat || <span className="text-gray-300">—</span>}</span>
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
                        {editingId === host.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => saveEdit(host.id)} disabled={saving}
                              className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 disabled:opacity-50">
                              <Save size={13}/>
                            </button>
                            <button onClick={cancelEdit}
                              className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200">
                              <X size={13}/>
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(host)}
                            className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-brand-100 hover:text-brand-700 transition-colors">
                            <Edit2 size={13}/>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
