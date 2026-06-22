'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Save, X, Pencil, Trash2, Package, Search } from 'lucide-react'

interface BrandProduct {
  id: string
  brand: string
  name: string
  sku: string | null
  price: number
  is_active: boolean
  created_at: string
}

interface ClientProfile { id: string; full_name: string; client_brand: string }

function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

const EMPTY = { name: '', sku: '', price: 0 }

export default function ProductEtalasePanel({ profile }: { profile: any }) {
  const [brands, setBrands] = useState<ClientProfile[]>([])
  const [selectedBrand, setSelectedBrand] = useState<string>('')
  const [products, setProducts] = useState<BrandProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Load client brands once
  useEffect(() => {
    createClient().from('profiles').select('id, full_name, client_brand')
      .eq('role', 'client').not('client_brand', 'is', null)
      .order('client_brand')
      .then(({ data }) => {
        const list = (data || []) as ClientProfile[]
        setBrands(list)
        setSelectedBrand(prev => prev || list[0]?.client_brand || '')
      })
  }, [])

  // Load products for the selected brand
  useEffect(() => {
    if (!selectedBrand) { setProducts([]); setLoading(false); return }
    setLoading(true)
    createClient().from('brand_products').select('*')
      .eq('brand', selectedBrand)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProducts((data || []) as BrandProduct[])
        setLoading(false)
      })
  }, [selectedBrand])

  function openCreate() {
    setEditingId(null); setForm({ ...EMPTY }); setError(''); setShowForm(true)
  }
  function openEdit(p: BrandProduct) {
    setEditingId(p.id)
    setForm({ name: p.name, sku: p.sku || '', price: p.price })
    setError(''); setShowForm(true)
  }
  function cancelForm() {
    setShowForm(false); setEditingId(null); setForm({ ...EMPTY }); setError('')
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Nama produk wajib diisi'); return }
    if (!selectedBrand) { setError('Pilih brand dulu'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const payload = {
      brand: selectedBrand,
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      price: Number(form.price) || 0,
    }
    if (editingId) {
      const { error: err } = await supabase.from('brand_products').update(payload).eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
      setProducts(prev => prev.map(p => p.id === editingId ? { ...p, ...payload } : p))
    } else {
      const { data, error: err } = await supabase.from('brand_products')
        .insert({ ...payload, is_active: true, created_by: profile.id }).select().single()
      if (err || !data) { setError(err?.message || 'Gagal menyimpan'); setSaving(false); return }
      setProducts(prev => [data as BrandProduct, ...prev])
    }
    setSaving(false)
    cancelForm()
  }

  async function toggleActive(p: BrandProduct) {
    const next = !p.is_active
    await createClient().from('brand_products').update({ is_active: next }).eq('id', p.id)
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, is_active: next } : x))
  }

  async function handleDelete(id: string) {
    await createClient().from('brand_products').delete().eq('id', id)
    setProducts(prev => prev.filter(p => p.id !== id))
    setConfirmDeleteId(null)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter(p =>
      p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
  }, [products, search])

  const activeCount = products.filter(p => p.is_active).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-gray-900">Product Etalase Live</h2>
          <p className="text-sm text-gray-500">
            Katalog produk per brand — sumber untuk laporan live & Top 5 produk
          </p>
        </div>
        <button onClick={openCreate} disabled={!selectedBrand}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm">
          <Plus size={15}/> Tambah Produk
        </button>
      </div>

      {/* Brand selector + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
          {brands.length === 0 && <option value="">— Belum ada client —</option>}
          {brands.map(b => <option key={b.id} value={b.client_brand}>{b.client_brand}</option>)}
        </select>
        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-white flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="text-gray-300"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari produk..."
            className="flex-1 text-sm focus:outline-none"/>
        </div>
        {selectedBrand && (
          <span className="text-xs text-gray-400">{activeCount} aktif · {products.length} total</span>
        )}
      </div>

      {/* Create / edit form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-brand-900 text-sm">
              {editingId ? 'Edit Produk' : `Produk Baru — ${selectedBrand}`}
            </h3>
            <button onClick={cancelForm} className="p-1.5 rounded-lg hover:bg-gray-100">
              <X size={16} className="text-gray-400"/>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Nama Produk *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Serum Vitamin C 30ml"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">SKU / Kode</label>
              <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="opsional"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Harga (Rp)</label>
              <input type="number" min="0" value={form.price}
                onChange={e => setForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
              <X size={14} className="text-red-500 flex-shrink-0"/>
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
          <div className="flex gap-2.5">
            <button onClick={cancelForm}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50">
              Batal
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2">
              <Save size={14}/> {saving ? 'Menyimpan...' : editingId ? 'Perbarui' : 'Simpan Produk'}
            </button>
          </div>
        </div>
      )}

      {/* Product list */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-400">Memuat...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <Package size={32} className="text-gray-200 mx-auto mb-3"/>
          <p className="text-sm font-medium text-gray-400">
            {products.length === 0 ? 'Belum ada produk untuk brand ini' : 'Tidak ada produk cocok'}
          </p>
          {products.length === 0 && selectedBrand && (
            <p className="text-xs text-gray-300 mt-1">Klik "Tambah Produk" untuk mulai mengisi katalog</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left font-semibold w-8">No</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[200px]">Produk</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[110px]">SKU</th>
                  <th className="px-4 py-3 text-right font-semibold min-w-[120px]">Harga</th>
                  <th className="px-4 py-3 text-center font-semibold min-w-[80px]">Status</th>
                  <th className="px-4 py-3 text-left font-semibold w-24">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p, idx) => {
                  const isConfirm = confirmDeleteId === p.id
                  return (
                    <tr key={p.id} className={`hover:bg-gray-50/60 transition-colors ${!p.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">{p.sku || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{p.price > 0 ? fmtRp(p.price) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleActive(p)}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-colors ${
                            p.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}>
                          {p.is_active ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {isConfirm ? (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => handleDelete(p.id)}
                              className="text-[10px] bg-red-500 text-white px-2 py-1 rounded-lg font-semibold hover:bg-red-600">Hapus</button>
                            <button onClick={() => setConfirmDeleteId(null)}
                              className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-semibold hover:bg-gray-200">Batal</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(p)} title="Edit"
                              className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-brand-100 hover:text-brand-700 transition-colors">
                              <Pencil size={13}/>
                            </button>
                            <button onClick={() => setConfirmDeleteId(p.id)} title="Hapus"
                              className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors">
                              <Trash2 size={13}/>
                            </button>
                          </div>
                        )}
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
