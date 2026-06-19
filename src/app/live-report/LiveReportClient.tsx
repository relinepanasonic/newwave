'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getPayPeriod, toLocalDateStr, SESSION_LABELS, PLATFORM_COLORS, formatCurrency } from '@/lib/utils'
import { Upload, X, CheckCircle2, Camera, TrendingUp, ChevronDown, ChevronUp, Plus, Package, Trash2 } from 'lucide-react'

interface Product {
  id?: string
  live_report_id: string
  produk_terjual: string
  product_klik: number
  item_sold: number
  total: number
}

function ProductsSection({ reportId, hostId, brand, reportDate }: { reportId: string; hostId: string; brand: string; reportDate: string }) {
  const [products, setProducts] = useState<Product[]>([])
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newProduct, setNewProduct] = useState({ produk_terjual: '', product_klik: 0, item_sold: 1, total: 0 })

  useEffect(() => {
    if (!expanded) return
    createClient().from('live_report_products').select('*').eq('live_report_id', reportId).order('created_at').then(({ data }) => {
      setProducts(data || [])
    })
  }, [reportId, expanded])

  async function addProduct() {
    if (!newProduct.produk_terjual.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('live_report_products').insert({
      live_report_id: reportId,
      host_id: hostId,
      report_date: reportDate,
      brand,
      produk_terjual: newProduct.produk_terjual,
      product_klik: Number(newProduct.product_klik),
      item_sold: Number(newProduct.item_sold),
      total: Number(newProduct.total),
    }).select().single()
    setSaving(false)
    if (!error && data) {
      setProducts(prev => [...prev, data])
      setNewProduct({ produk_terjual: '', product_klik: 0, item_sold: 1, total: 0 })
      setAdding(false)
    }
  }

  async function deleteProduct(id: string) {
    await createClient().from('live_report_products').delete().eq('id', id)
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  function fmtRp(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
  }

  const totalGmv = products.reduce((s, p) => s + (p.total || 0), 0)

  return (
    <div className="border-t border-gray-50">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <Package size={12} className="text-gray-400"/>
          <span className="font-medium">Produk Terjual {products.length > 0 && !expanded ? `(${products.length} produk)` : ''}</span>
          {totalGmv > 0 && expanded && <span className="text-emerald-600 font-semibold">{fmtRp(totalGmv)}</span>}
        </div>
        {expanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Products table */}
          {products.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                    <th className="px-2 py-2 text-left font-semibold">Produk</th>
                    <th className="px-2 py-2 text-center font-semibold">Klik</th>
                    <th className="px-2 py-2 text-center font-semibold">Terjual</th>
                    <th className="px-2 py-2 text-right font-semibold">Total</th>
                    <th className="px-2 py-2 w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2 text-gray-800 max-w-[180px]">
                        <p className="truncate font-medium">{p.produk_terjual}</p>
                      </td>
                      <td className="px-2 py-2 text-center text-gray-600">{p.product_klik}</td>
                      <td className="px-2 py-2 text-center font-semibold text-gray-800">{p.item_sold}</td>
                      <td className="px-2 py-2 text-right font-semibold text-emerald-700">{fmtRp(p.total)}</td>
                      <td className="px-2 py-2">
                        <button onClick={() => p.id && deleteProduct(p.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 size={11}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-emerald-50">
                    <td colSpan={3} className="px-2 py-1.5 text-xs font-bold text-emerald-700">Total</td>
                    <td className="px-2 py-1.5 text-right text-xs font-bold text-emerald-700">{fmtRp(totalGmv)}</td>
                    <td/>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Add product form */}
          {adding ? (
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <div>
                <label className="text-[10px] text-gray-400 font-medium block mb-1">Nama Produk *</label>
                <input value={newProduct.produk_terjual}
                  onChange={e => setNewProduct(p => ({ ...p, produk_terjual: e.target.value }))}
                  placeholder="Kompas Gas 3 Tungku - NIKO..."
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 font-medium block mb-1">Product Klik</label>
                  <input type="number" min="0" value={newProduct.product_klik}
                    onChange={e => setNewProduct(p => ({ ...p, product_klik: parseInt(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-medium block mb-1">Item Sold</label>
                  <input type="number" min="0" value={newProduct.item_sold}
                    onChange={e => setNewProduct(p => ({ ...p, item_sold: parseInt(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-medium block mb-1">Total (Rp)</label>
                  <input type="number" min="0" value={newProduct.total}
                    onChange={e => setNewProduct(p => ({ ...p, total: parseInt(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addProduct} disabled={saving || !newProduct.produk_terjual.trim()}
                  className="flex-1 bg-brand-600 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-brand-700 disabled:opacity-50">
                  {saving ? 'Menyimpan...' : '+ Simpan Produk'}
                </button>
                <button onClick={() => { setAdding(false); setNewProduct({ produk_terjual: '', product_klik: 0, item_sold: 1, total: 0 }) }}
                  className="px-3 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="w-full flex items-center justify-center gap-1.5 border border-dashed border-gray-200 rounded-xl py-2 text-xs text-gray-400 hover:border-brand-300 hover:text-brand-600 transition-colors">
              <Plus size={12}/> Tambah Produk
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const PLATFORMS = ['TikTok', 'Shopee', 'Instagram', 'YouTube', 'Other']

interface Report {
  id: string; report_date: string; brand: string; platform: string
  start_time: string; duration_hours: number
  gmv: number; impression: number; viewer: number; trans: number; comment_count: number
  screenshot_url: string; notes: string
  slot_id: string
}

interface Slot {
  id: string; session_no: number; brand: string; platform: string
  status: string; rooms: { name: string }
}

const EMPTY_FORM = {
  slot_id: '', brand: '', platform: '', start_time: '', duration_hours: 0,
  gmv: 0, impression: 0, viewer: 0, trans: 0, comment_count: 0, notes: '',
}

export default function LiveReportClient({ profile }: { profile: any }) {
  const params = useSearchParams()
  const [todaySlots, setTodaySlots] = useState<Slot[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const payPeriod = getPayPeriod()
  const todayStr = toLocalDateStr(new Date())
  const periodStart = toLocalDateStr(payPeriod.start)
  const periodEnd = toLocalDateStr(payPeriod.end)

  const hostId = profile.role === 'host' ? profile.id : null

  useEffect(() => {
    const supabase = createClient()
    const uid = profile.role === 'host' ? profile.id : null

    Promise.all([
      // Today's slots for this host
      uid
        ? supabase.from('schedule_slots')
            .select('id, session_no, brand, platform, status, rooms(name)')
            .eq('slot_date', todayStr)
            .eq('host_id', uid)
            .order('session_no')
        : Promise.resolve({ data: [] }),
      // Reports this period
      supabase.from('live_reports')
        .select('*')
        .eq(uid ? 'host_id' : 'id', uid || '___none___')
        .gte('report_date', periodStart)
        .lte('report_date', periodEnd)
        .order('report_date', { ascending: false })
        .order('start_time', { ascending: false }),
    ]).then(([slots, reps]) => {
      setTodaySlots((slots.data as Slot[]) || [])
      setReports(reps.data || [])
    })

    // Pre-fill from URL param ?slot=...
    const slotParam = params.get('slot')
    if (slotParam) setForm(f => ({ ...f, slot_id: slotParam }))
  }, [profile.id, profile.role, todayStr, periodStart, periodEnd, params])

  // Auto-fill brand/platform when slot selected
  useEffect(() => {
    if (form.slot_id) {
      const slot = todaySlots.find(s => s.id === form.slot_id)
      if (slot) {
        setForm(f => ({
          ...f,
          brand: slot.brand || f.brand,
          platform: slot.platform || f.platform,
        }))
      }
    }
  }, [form.slot_id, todaySlots])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScreenshotFile(file)
    const url = URL.createObjectURL(file)
    setScreenshotPreview(url)
  }

  function removeScreenshot() {
    setScreenshotFile(null)
    setScreenshotPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function uploadScreenshot(): Promise<string | null> {
    if (!screenshotFile) return null
    setUploading(true)
    const supabase = createClient()
    const ext = screenshotFile.name.split('.').pop() || 'jpg'
    const path = `${profile.id}/${todayStr}-${Date.now()}.${ext}`
    const { data, error } = await supabase.storage
      .from('live-reports')
      .upload(path, screenshotFile, { contentType: screenshotFile.type })
    setUploading(false)
    if (error) { setError('Upload screenshot gagal: ' + error.message); return null }
    const { data: urlData } = supabase.storage.from('live-reports').getPublicUrl(data.path)
    return urlData.publicUrl
  }

  // Validation
  const canSubmit = form.brand.trim() !== '' && form.platform !== '' && screenshotFile !== null && (form.gmv > 0 || form.impression > 0)
  const missingFields = [
    !form.brand.trim() && 'Brand',
    !form.platform && 'Platform',
    !screenshotFile && 'Screenshot',
    (form.gmv === 0 && form.impression === 0) && 'GMV atau Impresi (minimal 1)',
  ].filter(Boolean)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(''); setSuccess('')
    setSaving(true)

    let screenshotUrl: string | null = null
    if (screenshotFile) {
      screenshotUrl = await uploadScreenshot()
      if (!screenshotUrl && screenshotFile) { setSaving(false); return }
    }

    const supabase = createClient()
    const payload = {
      host_id: profile.id,
      slot_id: form.slot_id || null,
      report_date: todayStr,
      brand: form.brand || null,
      platform: form.platform || null,
      start_time: form.start_time || null,
      duration_hours: Number(form.duration_hours) || 0,
      gmv: Number(form.gmv) || 0,
      impression: Number(form.impression) || 0,
      viewer: Number(form.viewer) || 0,
      trans: Number(form.trans) || 0,
      comment_count: Number(form.comment_count) || 0,
      screenshot_url: screenshotUrl,
      notes: form.notes || null,
    }

    const { data, error: err } = await supabase.from('live_reports').insert(payload).select().single()
    setSaving(false)

    if (err) { setError(err.message); return }

    setReports(prev => [data, ...prev])
    setForm({ ...EMPTY_FORM })
    setScreenshotFile(null); setScreenshotPreview(null)
    if (fileRef.current) fileRef.current.value = ''
    setSuccess('Laporan berhasil disimpan!')
    setTimeout(() => setSuccess(''), 4000)
  }

  function fmtRp(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
  }
  function fmtNum(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return n.toString()
  }

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-5 max-w-4xl mx-auto space-y-6">

        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Camera size={20} className="text-brand-600" /> Live Report
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Submit laporan setiap selesai live — foto dashboard TikTok/Shopee + statistik
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-brand-50">
            <h2 className="font-bold text-brand-900 text-sm">Submit Laporan Baru</h2>
            <p className="text-xs text-brand-600 mt-0.5">Tanggal: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>

          <div className="p-5 space-y-4">

            {/* Session selector */}
            {todaySlots.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Sesi (opsional — pilih jika sesuai jadwal hari ini)
                </label>
                <select value={form.slot_id} onChange={e => setForm(f => ({ ...f, slot_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50">
                  <option value="">— Pilih sesi —</option>
                  {todaySlots.map(s => (
                    <option key={s.id} value={s.id}>
                      {SESSION_LABELS[s.session_no]} · {s.rooms?.name} {s.brand ? `· ${s.brand}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Brand + Platform */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Brand</label>
                <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  placeholder="e.g. Niko" required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Platform</label>
                <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50">
                  <option value="">— Pilih —</option>
                  {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Start time + Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Jam Mulai</label>
                <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Durasi (jam)</label>
                <input type="number" min="0" max="12" step="0.5" value={form.duration_hours || ''}
                  onChange={e => setForm(f => ({ ...f, duration_hours: parseFloat(e.target.value) || 0 }))}
                  placeholder="e.g. 4"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50" />
              </div>
            </div>

            {/* Stats grid */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Statistik Live</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { key: 'gmv', label: 'GMV (Rp)', prefix: 'Rp', emoji: '💰' },
                  { key: 'impression', label: 'Impresi', prefix: '', emoji: '👁' },
                  { key: 'viewer', label: 'Penonton', prefix: '', emoji: '👥' },
                  { key: 'trans', label: 'Transaksi', prefix: '', emoji: '🛒' },
                  { key: 'comment_count', label: 'Komentar', prefix: '', emoji: '💬' },
                ].map(({ key, label, emoji }) => (
                  <div key={key} className="bg-gray-50 rounded-xl p-2.5">
                    <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">{emoji} {label}</p>
                    <input
                      type="number" min="0" value={(form as any)[key] || ''}
                      onChange={e => setForm(f => ({ ...f, [key]: parseInt(e.target.value) || 0 }))}
                      placeholder="0"
                      className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Screenshot upload */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Screenshot Dashboard Live
              </label>
              {screenshotPreview ? (
                <div className="relative inline-block">
                  <img src={screenshotPreview} alt="Preview"
                    className="rounded-xl border border-gray-200 max-h-48 max-w-full object-contain shadow-sm" />
                  <button type="button" onClick={removeScreenshot}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
                  <Upload size={24} className="text-gray-300" />
                  <p className="text-sm text-gray-400 font-medium">Klik untuk upload screenshot</p>
                  <p className="text-xs text-gray-300">PNG, JPG, JPEG — Max 10MB</p>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Catatan (opsional)</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} placeholder="Produk highlight, kendala teknis, dll..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50 resize-none" />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
            {success && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                <CheckCircle2 size={16} /> {success}
              </div>
            )}
          </div>

          <div className="px-5 pb-5 space-y-2">
            {!canSubmit && missingFields.length > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
                Belum lengkap: <strong>{missingFields.join(', ')}</strong>
              </p>
            )}
            <button type="submit" disabled={saving || uploading || !canSubmit}
              className="w-full bg-brand-600 text-white rounded-xl py-3.5 font-semibold text-sm hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity">
              {saving || uploading ? (uploading ? 'Mengupload...' : 'Menyimpan...') : '✓ Submit Laporan Live'}
            </button>
          </div>
        </form>

        {/* Reports history */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-brand-600" />
            <h2 className="font-bold text-gray-900 text-sm">Laporan Periode Ini</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{reports.length}</span>
          </div>

          {reports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
              Belum ada laporan periode ini
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map(r => (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-start gap-4 p-4">
                    {/* Screenshot thumb */}
                    {r.screenshot_url ? (
                      <button onClick={() => window.open(r.screenshot_url, '_blank')} className="flex-shrink-0">
                        <img src={r.screenshot_url} alt="SS"
                          className="w-20 h-16 rounded-xl object-cover border-2 border-brand-200 shadow-sm hover:border-brand-400 transition-colors" />
                      </button>
                    ) : (
                      <div className="w-20 h-16 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Camera size={20} className="text-gray-300" />
                      </div>
                    )}
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-gray-900 text-sm">{r.brand || '—'}</span>
                        {r.platform && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[r.platform] || PLATFORM_COLORS.Other}`}>
                            {r.platform}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{new Date(r.report_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                        {r.start_time && <span className="text-xs text-gray-400">{r.start_time}</span>}
                        {r.duration_hours > 0 && <span className="text-xs text-gray-400">{r.duration_hours}j</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="text-xs font-semibold text-green-700">💰 {fmtRp(r.gmv)}</span>
                        <span className="text-xs text-gray-500">👁 {fmtNum(r.impression)}</span>
                        <span className="text-xs text-gray-500">👥 {fmtNum(r.viewer)}</span>
                        <span className="text-xs text-gray-500">🛒 {r.trans}</span>
                        <span className="text-xs text-gray-500">💬 {r.comment_count}</span>
                      </div>
                      {r.notes && <p className="text-xs text-gray-400 mt-1 italic">{r.notes}</p>}
                    </div>
                  </div>
                  <ProductsSection
                    reportId={r.id}
                    hostId={profile.id}
                    brand={r.brand || ''}
                    reportDate={r.report_date}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </AppShell>
  )
}
