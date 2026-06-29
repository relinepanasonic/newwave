'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Pencil, Trash2, Package } from 'lucide-react'

const TIPE_LIVE = ['Regular', 'Silver', 'Gold', 'Platinum', 'Rubi', 'UGC', 'Pre Content', 'Background Design', 'Other']

function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

interface NwPackage {
  id: string
  name: string
  description: string | null
  tipe_live: string
  jam_per_sesi: number
  price_per_jam: number
  sort_order: number
  is_active: boolean
}

const EMPTY_FORM = { name: '', description: '', tipe_live: 'Regular', jam_per_sesi: 4, price_per_jam: 0, sort_order: 0, is_active: true }

export default function ServicePackagePanel() {
  const [packages, setPackages] = useState<NwPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'new' | NwPackage | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function fetchPackages() {
    const supabase = createClient()
    const { data } = await supabase.from('nw_packages').select('*').order('sort_order').order('name')
    setPackages(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchPackages() }, [])

  function openNew() {
    setForm({ ...EMPTY_FORM, sort_order: packages.length + 1 })
    setModal('new'); setError('')
  }

  function openEdit(pkg: NwPackage) {
    setForm({
      name: pkg.name, description: pkg.description || '', tipe_live: pkg.tipe_live,
      jam_per_sesi: pkg.jam_per_sesi, price_per_jam: pkg.price_per_jam,
      sort_order: pkg.sort_order, is_active: pkg.is_active,
    })
    setModal(pkg); setError('')
  }

  async function save() {
    if (!form.name.trim()) { setError('Nama paket wajib diisi'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const payload = {
      name: form.name.trim(), description: form.description || null,
      tipe_live: form.tipe_live, jam_per_sesi: Number(form.jam_per_sesi),
      price_per_jam: Number(form.price_per_jam), sort_order: Number(form.sort_order),
      is_active: form.is_active,
    }
    if (modal === 'new') {
      await supabase.from('nw_packages').insert(payload)
    } else if (modal && typeof modal === 'object') {
      await supabase.from('nw_packages').update(payload).eq('id', modal.id)
    }
    await fetchPackages()
    setSaving(false); setModal(null)
  }

  async function handleDelete(id: string) {
    await createClient().from('nw_packages').delete().eq('id', id)
    setPackages(prev => prev.filter(p => p.id !== id))
    setConfirmDeleteId(null)
  }

  async function toggleActive(pkg: NwPackage) {
    await createClient().from('nw_packages').update({ is_active: !pkg.is_active }).eq('id', pkg.id)
    setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, is_active: !p.is_active } : p))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-gray-900">NW Service Package</h2>
          <p className="text-sm text-gray-500">{packages.length} paket layanan · dipakai di dropdown Invoice</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-1.5 bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-brand-700 transition-colors shadow-sm">
          <Plus size={15}/> Paket Baru
        </button>
      </div>

      {/* Table — pic-2 style */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Memuat...</div>
        ) : packages.length === 0 ? (
          <div className="p-16 text-center">
            <Package size={32} className="text-gray-200 mx-auto mb-3"/>
            <p className="text-sm font-medium text-gray-400">Belum ada paket layanan</p>
            <p className="text-xs text-gray-300 mt-1">Buat paket untuk dipakai di Invoice</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-widest">
                  <th className="px-4 py-3 text-left font-bold w-10">#</th>
                  <th className="px-4 py-3 text-left font-bold">Nama Paket</th>
                  <th className="px-4 py-3 text-left font-bold">Tipe Live</th>
                  <th className="px-4 py-3 text-center font-bold">Jam/Sesi</th>
                  <th className="px-4 py-3 text-right font-bold">Harga/Jam</th>
                  <th className="px-4 py-3 text-center font-bold">Status</th>
                  <th className="px-4 py-3 text-right font-bold w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {packages.map((pkg, i) => {
                  const isConfirm = confirmDeleteId === pkg.id
                  return (
                    <tr key={pkg.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{pkg.name}</p>
                        {pkg.description && <p className="text-[11px] text-gray-400 mt-0.5 max-w-xs truncate">{pkg.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-semibold text-[11px]">{pkg.tipe_live}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{pkg.jam_per_sesi}j</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{fmtRp(pkg.price_per_jam)}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleActive(pkg)}
                          className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold transition-colors ${
                            pkg.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                          {pkg.is_active ? 'Active' : 'Nonaktif'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          {!isConfirm ? (
                            <>
                              <button onClick={() => openEdit(pkg)} title="Edit"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
                                <Pencil size={14}/>
                              </button>
                              <button onClick={() => setConfirmDeleteId(pkg.id)} title="Hapus"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 size={14}/>
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => handleDelete(pkg.id)}
                                className="text-[10px] bg-red-500 text-white px-2.5 py-1.5 rounded-lg font-semibold hover:bg-red-600 transition-colors">
                                Hapus
                              </button>
                              <button onClick={() => setConfirmDeleteId(null)}
                                className="text-[10px] bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-lg font-semibold hover:bg-gray-200 transition-colors">
                                Batal
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)' }}>
              <h3 className="font-bold text-brand-900 text-sm">{modal === 'new' ? 'Paket Baru' : 'Edit Paket'}</h3>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-brand-100 transition-colors">
                <X size={16} className="text-brand-400"/>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Nama Paket *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="NW Silver Package"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Deskripsi</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="4 jam per sesi · Concept Live · Silver Level Host"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Tipe Live</label>
                  <select value={form.tipe_live} onChange={e => setForm(f => ({ ...f, tipe_live: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                    {TIPE_LIVE.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Jam / Sesi</label>
                  <input type="number" min="0" step="0.5" value={form.jam_per_sesi}
                    onChange={e => setForm(f => ({ ...f, jam_per_sesi: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Harga / Jam</label>
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-400">
                    <span className="px-2 py-2.5 bg-gray-50 text-[10px] text-gray-400 border-r border-gray-200 font-semibold">Rp</span>
                    <input type="number" min="0" value={form.price_per_jam}
                      onChange={e => setForm(f => ({ ...f, price_per_jam: parseInt(e.target.value) || 0 }))}
                      className="flex-1 w-0 px-2 py-2.5 text-sm focus:outline-none"/>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Urutan</label>
                  <input type="number" min="0" value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded accent-brand-600"/>
                <span className="text-sm text-gray-600">Aktif (tampil di dropdown Invoice)</span>
              </label>

              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

              <div className="flex gap-2.5 pt-1">
                <button onClick={() => setModal(null)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                  Batal
                </button>
                <button onClick={save} disabled={saving}
                  className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-brand-700 disabled:opacity-60 transition-colors shadow-sm">
                  {saving ? 'Menyimpan...' : modal === 'new' ? 'Tambah Paket' : 'Simpan Perubahan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
