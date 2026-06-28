'use client'
import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { Plus, Save, X, Pencil, Trash2, Package, Search, Upload } from 'lucide-react'

type Platform = 'Shopee' | 'TikTok'

interface BrandProduct {
  id: string
  brand: string
  name: string
  sku: string | null
  price: number
  platform: string | null
  is_active: boolean
  created_at: string
}

interface ClientProfile { id: string; full_name: string; client_brand: string }

function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

const PLATFORM_BADGE: Record<string, string> = {
  Shopee: 'bg-orange-100 text-orange-700',
  TikTok: 'bg-gray-900 text-white',
}

const EMPTY = { name: '', sku: '', price: 0, platform: '' }

export default function ProductEtalasePanel({ profile }: { profile: any }) {
  const [brands, setBrands] = useState<ClientProfile[]>([])
  const [selectedBrand, setSelectedBrand] = useState<string>('')
  const [products, setProducts] = useState<BrandProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState<'all' | Platform>('all')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  // Import-from-file modal
  const [showImport, setShowImport] = useState(false)
  const [importPlatform, setImportPlatform] = useState<Platform>('Shopee')
  const [importFileName, setImportFileName] = useState('')
  const [importRows, setImportRows] = useState<{ name: string; sku: string }[]>([])
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importDone, setImportDone] = useState<string | null>(null)

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

  // Reset selection when brand changes
  useEffect(() => { setSelectedIds([]) }, [selectedBrand])

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
    setForm({ name: p.name, sku: p.sku || '', price: p.price, platform: p.platform || '' })
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
      platform: form.platform || null,
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
    setSelectedIds(prev => prev.filter(x => x !== id))
    setConfirmDeleteId(null)
  }

  async function handleBulkDelete() {
    if (!selectedIds.length) return
    setBulkDeleting(true)
    await createClient().from('brand_products').delete().in('id', selectedIds)
    setProducts(prev => prev.filter(p => !selectedIds.includes(p.id)))
    setSelectedIds([])
    setConfirmBulkDelete(false)
    setBulkDeleting(false)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    if (selectedIds.length === filtered.length) setSelectedIds([])
    else setSelectedIds(filtered.map(p => p.id))
  }

  // ── Import from Shopee CSV / TikTok XLSX ──────────────────────────────────
  function openImport() {
    setImportPlatform('Shopee'); setImportFileName(''); setImportRows([])
    setImportError(''); setImportDone(null); setShowImport(true)
  }

  async function handleFile(file: File) {
    setImportError(''); setImportDone(null); setImportRows([]); setImportFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' })
      if (!rows.length) { setImportError('File kosong atau tidak terbaca'); return }

      const headers = Object.keys(rows[0])
      let nameCol: string | undefined
      let idCol: string | undefined

      if (importPlatform === 'Shopee') {
        nameCol = headers.find(h => h.trim().toLowerCase() === 'produk')
        if (!nameCol) nameCol = headers.find(h => /\bproduk\b/i.test(h))
      } else {
        // TikTok: product name is typically column B, product ID is column A
        // Match "Product name" specifically — not "Product ID"
        nameCol = headers.find(h => h.trim().toLowerCase() === 'product name')
        if (!nameCol) nameCol = headers.find(h => /product\s*name/i.test(h))
        if (!nameCol) nameCol = headers[1]  // fallback: column B

        idCol = headers.find(h => h.trim().toLowerCase() === 'product id')
        if (!idCol) idCol = headers.find(h => /product\s*id/i.test(h))
        if (!idCol && nameCol !== headers[0]) idCol = headers[0]  // fallback: column A
      }

      if (!nameCol) {
        setImportError(`Kolom nama produk tidak ditemukan. Kolom tersedia: ${headers.slice(0, 6).join(', ')}…`)
        return
      }

      // Unique (case-insensitive) within the file
      const seen = new Set<string>()
      const result: { name: string; sku: string }[] = []
      for (const r of rows) {
        const name = String(r[nameCol] ?? '').trim()
        if (!name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        const sku = idCol ? String(r[idCol] ?? '').trim() : ''
        result.push({ name, sku })
      }
      if (!result.length) { setImportError('Tidak ada nama produk di kolom tersebut'); return }
      setImportRows(result)
    } catch (e: any) {
      setImportError('Gagal membaca file: ' + (e?.message || 'format tidak didukung'))
    }
  }

  // Names already in the catalog for this brand (case-insensitive) are skipped
  const existingNameSet = useMemo(
    () => new Set(products.map(p => p.name.trim().toLowerCase())), [products])
  const newImportRows = useMemo(
    () => importRows.filter(r => !existingNameSet.has(r.name.toLowerCase())),
    [importRows, existingNameSet])

  async function runImport() {
    if (!selectedBrand || newImportRows.length === 0) return
    setImporting(true); setImportError('')
    const rows = newImportRows.map(r => ({
      brand: selectedBrand, name: r.name, sku: r.sku || null,
      platform: importPlatform, is_active: true, created_by: profile.id,
    }))
    const { data, error: err } = await createClient()
      .from('brand_products').insert(rows).select()
    setImporting(false)
    if (err) { setImportError(err.message); return }
    setProducts(prev => [...(data as BrandProduct[]), ...prev])
    const skipped = importRows.length - newImportRows.length
    setImportDone(`${data?.length || 0} produk diimpor${skipped > 0 ? `, ${skipped} duplikat dilewati` : ''}.`)
    setImportRows([]); setImportFileName('')
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(p => {
      if (platformFilter !== 'all' && p.platform !== platformFilter) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    })
  }, [products, search, platformFilter])

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
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            confirmBulkDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-semibold">Hapus {selectedIds.length} produk?</span>
                <button onClick={handleBulkDelete} disabled={bulkDeleting}
                  className="px-3 py-2 bg-red-500 text-white rounded-xl text-xs font-semibold hover:bg-red-600 disabled:opacity-60">
                  {bulkDeleting ? 'Menghapus...' : 'Ya, Hapus'}
                </button>
                <button onClick={() => setConfirmBulkDelete(false)}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50">Batal</button>
              </div>
            ) : (
              <button onClick={() => setConfirmBulkDelete(true)}
                className="flex items-center gap-2 border border-red-200 text-red-600 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-50 transition-colors">
                <Trash2 size={15}/> Hapus {selectedIds.length} Dipilih
              </button>
            )
          )}
          <button onClick={openImport} disabled={!selectedBrand}
            className="flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors">
            <Upload size={15}/> Import
          </button>
          <button onClick={openCreate} disabled={!selectedBrand}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm">
            <Plus size={15}/> Tambah Produk
          </button>
        </div>
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
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
          {(['all', 'Shopee', 'TikTok'] as const).map(p => (
            <button key={p} onClick={() => setPlatformFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                platformFilter === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {p === 'all' ? 'Semua' : p}
            </button>
          ))}
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
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Platform</label>
              <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                <option value="">—</option>
                <option value="Shopee">Shopee</option>
                <option value="TikTok">TikTok</option>
              </select>
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
                  <th className="px-4 py-3 text-center w-10">
                    <input type="checkbox"
                      checked={filtered.length > 0 && selectedIds.length === filtered.length}
                      onChange={toggleSelectAll}
                      className="rounded accent-brand-600 cursor-pointer"/>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold w-8">No</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[200px]">Produk</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[90px]">Platform</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[140px]">ID / SKU</th>
                  <th className="px-4 py-3 text-right font-semibold min-w-[120px]">Harga</th>
                  <th className="px-4 py-3 text-center font-semibold min-w-[80px]">Status</th>
                  <th className="px-4 py-3 text-left font-semibold w-24">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p, idx) => {
                  const isConfirm = confirmDeleteId === p.id
                  const isSelected = selectedIds.includes(p.id)
                  return (
                    <tr key={p.id} className={`hover:bg-gray-50/60 transition-colors ${!p.is_active ? 'opacity-50' : ''} ${isSelected ? 'bg-brand-50/40' : ''}`}>
                      <td className="px-4 py-3 text-center">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)}
                          className="rounded accent-brand-600 cursor-pointer"/>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{p.name}</td>
                      <td className="px-4 py-3">
                        {p.platform ? (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${PLATFORM_BADGE[p.platform] || 'bg-gray-100 text-gray-500'}`}>
                            {p.platform}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
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

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !importing && setShowImport(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center">
                  <Upload size={16} className="text-brand-600"/>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Import Produk</h3>
                  <p className="text-[11px] text-gray-400">{selectedBrand} — hanya nama produk yang diambil</p>
                </div>
              </div>
              <button onClick={() => setShowImport(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={16} className="text-gray-400"/>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Platform picker */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Platform</label>
                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                  {(['Shopee', 'TikTok'] as Platform[]).map(p => (
                    <button key={p}
                      onClick={() => { setImportPlatform(p); setImportRows([]); setImportFileName(''); setImportError(''); setImportDone(null) }}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                        importPlatform === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  {importPlatform === 'Shopee'
                    ? 'File CSV Shopee — kolom "Produk"'
                    : 'File XLSX TikTok — kolom "Product name"'}
                </p>
              </div>

              {/* File input */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">File</label>
                <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-xl px-3 py-3 text-sm text-gray-500 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
                  <Upload size={14} className="text-gray-400"/>
                  <span className="truncate">{importFileName || 'Pilih file CSV / XLSX...'}</span>
                  <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}/>
                </label>
              </div>

              {importError && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                  <X size={14} className="text-red-500 flex-shrink-0 mt-0.5"/>
                  <p className="text-xs text-red-600">{importError}</p>
                </div>
              )}
              {importDone && (
                <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                  <Package size={14} className="text-emerald-500 flex-shrink-0"/>
                  <p className="text-xs text-emerald-700">{importDone}</p>
                </div>
              )}

              {importRows.length > 0 && (
                <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-gray-500">Ditemukan <b className="text-gray-800">{importRows.length}</b> produk</span>
                    <span className="text-brand-600 font-semibold">{newImportRows.length} baru</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {importRows.slice(0, 30).map((r, i) => {
                      const dup = existingNameSet.has(r.name.toLowerCase())
                      return (
                        <div key={i} className={`flex items-baseline gap-2 ${dup ? 'opacity-40' : ''}`}>
                          <p className={`text-[11px] truncate flex-1 ${dup ? 'line-through text-gray-400' : 'text-gray-600'}`}>{r.name}</p>
                          {r.sku && <span className="text-[10px] text-gray-400 font-mono flex-shrink-0 truncate max-w-[100px]">{r.sku}</span>}
                        </div>
                      )
                    })}
                    {importRows.length > 30 && <p className="text-[10px] text-gray-400">+{importRows.length - 30} lainnya…</p>}
                  </div>
                  {importRows.length - newImportRows.length > 0 && (
                    <p className="text-[10px] text-gray-400 mt-2">{importRows.length - newImportRows.length} duplikat (sudah ada) akan dilewati</p>
                  )}
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <button onClick={() => setShowImport(false)} disabled={importing}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50">
                  Tutup
                </button>
                <button onClick={runImport} disabled={importing || newImportRows.length === 0}
                  className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  <Upload size={14}/> {importing ? 'Mengimpor...' : `Import ${newImportRows.length} Produk`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
