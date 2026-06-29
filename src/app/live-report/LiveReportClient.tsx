'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getPayPeriod, toLocalDateStr, SESSION_LABELS, PLATFORM_COLORS, formatCurrency } from '@/lib/utils'
import { Upload, X, CheckCircle2, Camera, TrendingUp, ChevronDown, ChevronUp, Plus, Package, Trash2, PlayCircle } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'
import TimeInput from '@/components/TimeInput'

// ── ProductsSection (expandable per-report) ──────────────────────────────────
interface Product {
  id?: string; live_report_id: string; produk_terjual: string
  product_klik: number; item_sold: number; total: number
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
      live_report_id: reportId, host_id: hostId, report_date: reportDate, brand,
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
                      <td className="px-2 py-2 text-gray-800 max-w-[180px]"><p className="truncate font-medium">{p.produk_terjual}</p></td>
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
          {adding ? (
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <div>
                <label className="text-[10px] text-gray-400 font-medium block mb-1">Nama Produk *</label>
                <input value={newProduct.produk_terjual}
                  onChange={e => setNewProduct(p => ({ ...p, produk_terjual: e.target.value }))}
                  placeholder="Kompas Gas 3 Tungku..."
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([['product_klik','Product Klik'],['item_sold','Item Sold'],['total','Total (Rp)']] as const).map(([k, lbl]) => (
                  <div key={k}>
                    <label className="text-[10px] text-gray-400 font-medium block mb-1">{lbl}</label>
                    <input type="number" min="0" value={(newProduct as any)[k]}
                      onChange={e => setNewProduct(p => ({ ...p, [k]: parseInt(e.target.value) || 0 }))}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={addProduct} disabled={saving || !newProduct.produk_terjual.trim()}
                  className="flex-1 bg-brand-600 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-brand-700 disabled:opacity-50">
                  {saving ? 'Menyimpan...' : '+ Simpan Produk'}
                </button>
                <button onClick={() => { setAdding(false); setNewProduct({ produk_terjual: '', product_klik: 0, item_sold: 1, total: 0 }) }}
                  className="px-3 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">Batal</button>
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

// ── Main ─────────────────────────────────────────────────────────────────────
const PLATFORMS = ['TikTok', 'Shopee', 'Instagram', 'YouTube', 'Other']

interface Report {
  id: string; report_date: string; brand: string; platform: string
  start_time: string; duration_hours: number
  gmv: number; impression: number; viewer: number; trans: number; comment_count: number
  screenshot_url: string; notes: string; slot_id: string
}

interface Slot {
  id: string; session_no: number; brand: string; platform: string
  status: string; jam_mulai?: string; look_approval_at?: string; look_approval_url?: string
  rooms: { name: string }
}

interface EtalaseProduct {
  id: string; name: string; sku: string | null; price: number; platform: string | null
}

const EMPTY_FORM = {
  slot_id: '', brand: '', platform: '', start_time: '', duration_hours: 0,
  gmv: 0, impression: 0, viewer: 0, trans: 0, comment_count: 0, notes: '',
  product_sold_name: '',  // selected from etalase dropdown
  product_sold_other: '', // manual text when "Other" chosen
}

export default function LiveReportClient({ profile }: { profile: any }) {
  const { lang } = useLang()
  const params = useSearchParams()
  const [todaySlots, setTodaySlots] = useState<Slot[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [etalaseProducts, setEtalaseProducts] = useState<EtalaseProduct[]>([])
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploading, setUploading] = useState(false)
  const [recordingApproval, setRecordingApproval] = useState(false)
  // "Start Live" phase tracking — once pressed, timestamp stored and form revealed
  const [liveStartedAt, setLiveStartedAt] = useState<string | null>(null)
  const [startingLive, setStartingLive] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const lookCamRef = useRef<HTMLInputElement>(null)  // camera input for Look Approval photo

  const payPeriod = getPayPeriod()
  const todayStr = toLocalDateStr(new Date())
  const periodStart = toLocalDateStr(payPeriod.start)
  const periodEnd = toLocalDateStr(payPeriod.end)

  const hostId = profile.role === 'host' ? profile.id : null

  useEffect(() => {
    const supabase = createClient()
    const uid = profile.role === 'host' ? profile.id : null

    Promise.all([
      uid
        ? supabase.from('schedule_slots')
            .select('id, session_no, brand, platform, status, jam_mulai, look_approval_at, rooms(name)')
            .eq('slot_date', todayStr).eq('host_id', uid).order('session_no')
        : Promise.resolve({ data: [] }),
      supabase.from('live_reports')
        .select('*')
        .eq(uid ? 'host_id' : 'id', uid || '___none___')
        .gte('report_date', periodStart).lte('report_date', periodEnd)
        .order('report_date', { ascending: false }).order('start_time', { ascending: false }),
    ]).then(([slots, reps]) => {
      setTodaySlots((slots.data as Slot[]) || [])
      setReports(reps.data || [])
    })

    const slotParam = params.get('slot')
    if (slotParam) setForm(f => ({ ...f, slot_id: slotParam }))
  }, [profile.id, profile.role, todayStr, periodStart, periodEnd, params])

  // Fetch etalase products when brand is known, filtered to the slot's platform
  useEffect(() => {
    const brand = selectedSlot?.brand || form.brand
    if (!brand) { setEtalaseProducts([]); return }
    const platform = selectedSlot?.platform || form.platform
    createClient()
      .from('brand_products').select('id, name, sku, price, platform')
      .eq('brand', brand).eq('is_active', true).order('name')
      .then(({ data }) => {
        let list = data || []
        // Only restrict by platform for Shopee / TikTok — other platforms show all
        if (platform === 'Shopee' || platform === 'TikTok') {
          list = list.filter((p: any) => p.platform === platform)
        }
        setEtalaseProducts(list)
      })
  }, [form.slot_id, form.brand, form.platform, selectedSlot?.platform, todaySlots])

  // Auto-fill brand/platform when slot selected
  useEffect(() => {
    if (form.slot_id) {
      const slot = todaySlots.find(s => s.id === form.slot_id)
      if (slot) setForm(f => ({ ...f, brand: slot.brand || f.brand, platform: slot.platform || f.platform }))
    }
  }, [form.slot_id, todaySlots])

  // Reset live-started state when slot changes
  useEffect(() => {
    setLiveStartedAt(null)
  }, [form.slot_id])

  const selectedSlot = todaySlots.find(s => s.id === form.slot_id)

  // ── Look Approval ─────────────────────────────────────────────────────────
  // Tapping "Rekam Look Approval" opens the camera; once a photo is taken we
  // upload it and stamp both the time and the photo URL on the slot.
  function startLookApproval() {
    if (!form.slot_id) return
    lookCamRef.current?.click()
  }

  async function handleLookPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !form.slot_id) return
    setRecordingApproval(true)
    const supabase = createClient()
    const now = new Date().toISOString()

    // Upload the captured look photo
    let url: string | null = null
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `look-approval/${profile.id}/${form.slot_id}-${Date.now()}.${ext}`
    const { data, error: upErr } = await supabase.storage.from('live-reports').upload(path, file, { contentType: file.type })
    if (!upErr && data) url = supabase.storage.from('live-reports').getPublicUrl(data.path).data.publicUrl

    const { error } = await supabase.from('schedule_slots')
      .update({ look_approval_at: now, look_approval_url: url }).eq('id', form.slot_id)
    setRecordingApproval(false)
    if (e.target) e.target.value = ''
    if (!error) {
      setTodaySlots(prev => prev.map(s => s.id === form.slot_id ? { ...s, look_approval_at: now, look_approval_url: url || undefined } : s))
    }
  }

  function getLookApprovalStatus(): 'none' | 'done' | 'late' | 'no_slot' {
    if (!form.slot_id || !selectedSlot) return 'no_slot'
    if (!selectedSlot.look_approval_at) return 'none'
    const approvalTime = new Date(selectedSlot.look_approval_at)
    const sessionStart = selectedSlot.jam_mulai
      ? new Date(`${todayStr}T${selectedSlot.jam_mulai}`)
      : new Date(`${todayStr}T${String(selectedSlot.session_no - 1).padStart(2, '0')}:00:00`)
    return approvalTime > sessionStart ? 'late' : 'done'
  }

  const approvalStatus = form.slot_id ? getLookApprovalStatus() : 'no_slot'
  const approvalDone = approvalStatus === 'done' || approvalStatus === 'late'

  // ── Start Live ────────────────────────────────────────────────────────────
  async function handleStartLive() {
    setStartingLive(true)
    const now = new Date()
    const timeStr = now.toTimeString().slice(0, 5) // HH:MM
    const isoStr = now.toISOString()
    setLiveStartedAt(isoStr)
    // Pre-fill start_time from the timestamp
    setForm(f => ({ ...f, start_time: f.start_time || timeStr }))
    setStartingLive(false)
  }

  // ── File upload ───────────────────────────────────────────────────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScreenshotFile(file)
    setScreenshotPreview(URL.createObjectURL(file))
  }
  function removeScreenshot() {
    setScreenshotFile(null); setScreenshotPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function uploadScreenshot(): Promise<string | null> {
    if (!screenshotFile) return null
    setUploading(true)
    const supabase = createClient()
    const ext = screenshotFile.name.split('.').pop() || 'jpg'
    const path = `${profile.id}/${todayStr}-${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from('live-reports').upload(path, screenshotFile, { contentType: screenshotFile.type })
    setUploading(false)
    if (error) { setError('Upload screenshot gagal: ' + error.message); return null }
    return supabase.storage.from('live-reports').getPublicUrl(data.path).data.publicUrl
  }

  async function pushScreenshotToDrive() {
    if (!screenshotFile || !profile.full_name) return
    try {
      const ext = screenshotFile.name.split('.').pop() || 'jpg'
      const clean = (s: string) => (s || '').replace(/[.\\/]+/g, ' ').replace(/\s+/g, ' ').trim()
      const filename = `${clean(profile.full_name)}.${todayStr}.${clean(form.brand) || 'NoBrand'}.${clean(form.platform) || 'NoPlatform'}.${ext}`
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(screenshotFile)
      })
      await fetch('/api/drive/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_name: profile.full_name, filename, mime: screenshotFile.type || 'image/jpeg', base64 }),
      })
    } catch { /* non-fatal */ }
  }

  // ── Validation ────────────────────────────────────────────────────────────
  const catatan = form.notes.trim()
  const catatanOk = catatan.length >= 25
  const canSubmit = liveStartedAt !== null
    && form.brand.trim() !== ''
    && form.platform !== ''
    && screenshotFile !== null
    && (form.gmv > 0 || form.impression > 0)
    && catatanOk

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(''); setSuccess('')
    setSaving(true)

    let screenshotUrl: string | null = null
    if (screenshotFile) {
      screenshotUrl = await uploadScreenshot()
      if (!screenshotUrl) { setSaving(false); return }
      await pushScreenshotToDrive()
    }

    // Resolve the product sold name
    const productSoldName = form.product_sold_name === '__other__'
      ? form.product_sold_other.trim()
      : form.product_sold_name || null

    const supabase = createClient()
    const payload = {
      host_id: profile.id,
      slot_id: form.slot_id || null,
      report_date: todayStr,
      brand: form.brand || null,
      platform: form.platform || null,
      start_time: form.start_time || null,
      live_started_at: liveStartedAt,
      duration_hours: Number(form.duration_hours) || 0,
      gmv: Number(form.gmv) || 0,
      impression: Number(form.impression) || 0,
      viewer: Number(form.viewer) || 0,
      trans: Number(form.trans) || 0,
      comment_count: Number(form.comment_count) || 0,
      screenshot_url: screenshotUrl,
      notes: form.notes || null,
      product_sold_name: productSoldName,
    }

    const { data, error: err } = await supabase.from('live_reports').insert(payload).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }

    setReports(prev => [data, ...prev])
    setForm({ ...EMPTY_FORM })
    setScreenshotFile(null); setScreenshotPreview(null)
    if (fileRef.current) fileRef.current.value = ''
    setLiveStartedAt(null)
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

  const approvalTs = selectedSlot?.look_approval_at
    ? new Date(selectedSlot.look_approval_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : null
  const liveStartTs = liveStartedAt
    ? new Date(liveStartedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-5 max-w-xl mx-auto space-y-6">

        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Camera size={20} className="text-brand-600" /> Live Report
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* ── Session selector ── */}
        {todaySlots.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Sesi Hari Ini</label>
            <select value={form.slot_id} onChange={e => setForm(f => ({ ...f, slot_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50">
              <option value="">— Pilih sesi —</option>
              {todaySlots.map(s => (
                <option key={s.id} value={s.id}>
                  {SESSION_LABELS[s.session_no]} · {(s.rooms as any)?.name} {s.brand ? `· ${s.brand}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ── SECTION 1: Look Approval + Start Live ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-brand-50 to-purple-50">
            <h2 className="font-bold text-brand-900 text-sm flex items-center gap-2">
              <Camera size={14} className="text-brand-600"/> Pre-Live Check
            </h2>
          </div>

          <div className="p-5 space-y-4">
            {/* Look Approval block */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Look Approval</p>
              {approvalStatus === 'no_slot' || !form.slot_id ? (
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-400">
                  Pilih sesi terlebih dahulu untuk merekam Look Approval
                </div>
              ) : approvalStatus === 'none' ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-amber-800 mb-1">⚠️ Belum melakukan Look Approval</p>
                  <p className="text-[11px] text-amber-600 mb-2">Ambil foto look kamu sebelum mulai live</p>
                  <button type="button" onClick={startLookApproval} disabled={recordingApproval}
                    className="bg-amber-600 text-white rounded-lg px-4 py-2 text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2">
                    <Camera size={13}/>{recordingApproval ? 'Mengupload...' : 'Rekam Look Approval (Foto)'}
                  </button>
                </div>
              ) : approvalStatus === 'late' ? (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  {selectedSlot?.look_approval_url && (
                    <button type="button" onClick={() => window.open(selectedSlot.look_approval_url, '_blank')} className="flex-shrink-0">
                      <img src={selectedSlot.look_approval_url} alt="Look" className="w-14 h-14 rounded-lg object-cover border-2 border-red-200"/>
                    </button>
                  )}
                  <span className="text-base leading-none mt-0.5">🔴</span>
                  <div>
                    <p className="text-xs font-bold text-red-800">Late Approval — {approvalTs}</p>
                    <p className="text-[11px] text-red-600 mt-0.5">Look Approval direkam setelah jam mulai live</p>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  {selectedSlot?.look_approval_url ? (
                    <button type="button" onClick={() => window.open(selectedSlot.look_approval_url, '_blank')} className="flex-shrink-0">
                      <img src={selectedSlot.look_approval_url} alt="Look" className="w-14 h-14 rounded-lg object-cover border-2 border-emerald-200"/>
                    </button>
                  ) : (
                    <span className="text-base leading-none">✅</span>
                  )}
                  <div>
                    <p className="text-xs font-bold text-emerald-800">Look Approval — {approvalTs}</p>
                    <p className="text-[11px] text-emerald-600 mt-0.5">Tepat waktu</p>
                  </div>
                </div>
              )}
              {/* Hidden camera input — opens the back camera on mobile */}
              <input ref={lookCamRef} type="file" accept="image/*" capture="environment" onChange={handleLookPhoto} className="hidden"/>
            </div>

            {/* Start Live button */}
            {liveStartedAt ? (
              <div className="bg-green-50 border-2 border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <PlayCircle size={20} className="text-white"/>
                </div>
                <div>
                  <p className="text-sm font-bold text-green-800">Live Dimulai</p>
                  <p className="text-xs text-green-600 font-medium">{liveStartTs}</p>
                </div>
              </div>
            ) : (
              <button type="button" onClick={handleStartLive}
                disabled={!approvalDone || startingLive || !form.slot_id}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-2xl py-4 font-bold text-base flex items-center justify-center gap-3 transition-colors shadow-sm">
                <PlayCircle size={22}/>
                {startingLive ? 'Memulai...' : 'Start Live'}
              </button>
            )}
            {!approvalDone && form.slot_id && !liveStartedAt && (
              <p className="text-[11px] text-center text-amber-600">Selesaikan Look Approval untuk mengaktifkan Start Live</p>
            )}
          </div>
        </div>

        {/* ── SECTION 2: Report Form — revealed after Start Live ── */}
        {liveStartedAt && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-brand-50">
              <h2 className="font-bold text-brand-900 text-sm">Submit Laporan Live</h2>
              <p className="text-xs text-brand-600 mt-0.5">Live dimulai pukul {liveStartTs}</p>
            </div>

            <div className="p-5 space-y-4">

              {/* Brand + Platform */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Brand *</label>
                  <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    placeholder="e.g. Niko" required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Platform *</label>
                  <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50">
                    <option value="">— Pilih —</option>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Jam Mulai + Durasi */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Jam Mulai</label>
                  <TimeInput value={form.start_time} onChange={v => setForm(f => ({ ...f, start_time: v }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Durasi (jam)</label>
                  <input type="number" min="0" max="12" step="0.5" value={form.duration_hours || ''}
                    onChange={e => setForm(f => ({ ...f, duration_hours: parseFloat(e.target.value) || 0 }))}
                    placeholder="e.g. 4"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50"/>
                </div>
              </div>

              {/* Stats */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Statistik Live *</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {([
                    { key: 'gmv', label: 'GMV (Rp)', emoji: '💰' },
                    { key: 'impression', label: 'Impresi', emoji: '👁' },
                    { key: 'viewer', label: 'Penonton', emoji: '👥' },
                    { key: 'trans', label: 'Transaksi', emoji: '🛒' },
                    { key: 'comment_count', label: 'Komentar', emoji: '💬' },
                  ] as const).map(({ key, label, emoji }) => (
                    <div key={key} className="bg-gray-50 rounded-xl p-2.5">
                      <p className="text-xs text-gray-400 mb-1">{emoji} {label}</p>
                      <input type="number" min="0" value={(form as any)[key] || ''}
                        onChange={e => setForm(f => ({ ...f, [key]: parseInt(e.target.value) || 0 }))}
                        placeholder="0"
                        className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                    </div>
                  ))}
                </div>
              </div>

              {/* Screenshot */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  Screenshot Dashboard Live *
                </label>
                {screenshotPreview ? (
                  <div className="relative inline-block">
                    <img src={screenshotPreview} alt="Preview"
                      className="rounded-xl border border-gray-200 max-h-48 max-w-full object-contain shadow-sm"/>
                    <button type="button" onClick={removeScreenshot}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow">
                      <X size={12}/>
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
                    <Upload size={24} className="text-gray-300"/>
                    <p className="text-sm text-gray-400 font-medium">Klik untuk upload screenshot</p>
                    <p className="text-xs text-gray-300">PNG, JPG, JPEG — Max 10MB</p>
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden"/>
              </div>

              {/* Product Sold */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Produk yang Dijual
                </label>
                <select value={form.product_sold_name}
                  onChange={e => setForm(f => ({ ...f, product_sold_name: e.target.value, product_sold_other: '' }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50">
                  <option value="">— Pilih produk (opsional) —</option>
                  {etalaseProducts.map(p => (
                    <option key={p.id} value={p.name}>
                      {p.name}{p.sku ? ` (${p.sku})` : ''}{p.platform ? ` · ${p.platform}` : ''}
                    </option>
                  ))}
                  <option value="__other__">✏️ Produk Lain (isi manual)</option>
                </select>
                {form.product_sold_name === '__other__' && (
                  <input value={form.product_sold_other}
                    onChange={e => setForm(f => ({ ...f, product_sold_other: e.target.value }))}
                    placeholder="Nama produk yang dijual..."
                    className="w-full mt-2 border border-brand-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"/>
                )}
              </div>

              {/* Catatan — mandatory min 25 chars */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Catatan * <span className="text-gray-400 font-normal normal-case">(min. 25 karakter)</span>
                </label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3} placeholder="Highlight produk, kendala teknis, kondisi live, saran ke depan... (minimal 25 karakter)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50 resize-none"/>
                <div className="flex items-center justify-between mt-1">
                  <p className={`text-[11px] ${catatanOk ? 'text-emerald-600' : form.notes.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                    {form.notes.length} / 25 karakter minimum
                  </p>
                  {catatanOk && <CheckCircle2 size={13} className="text-emerald-500"/>}
                </div>
              </div>

              {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
              {success && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                  <CheckCircle2 size={16}/> {success}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 space-y-2">
              {!canSubmit && (
                <div className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 space-y-0.5">
                  {!form.brand.trim() && <p>· Brand wajib diisi</p>}
                  {!form.platform && <p>· Platform wajib dipilih</p>}
                  {!screenshotFile && <p>· Screenshot wajib diupload</p>}
                  {form.gmv === 0 && form.impression === 0 && <p>· Isi minimal GMV atau Impresi</p>}
                  {!catatanOk && <p>· Catatan minimal 25 karakter ({form.notes.length} sekarang)</p>}
                </div>
              )}
              <button type="submit" disabled={saving || uploading || !canSubmit}
                className="w-full bg-brand-600 text-white rounded-xl py-3.5 font-semibold text-sm hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity">
                {saving || uploading ? (uploading ? 'Mengupload...' : 'Menyimpan...') : '✓ Submit Laporan Live'}
              </button>
            </div>
          </form>
        )}

        {/* ── Reports history ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-brand-600"/>
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
                    {r.screenshot_url ? (
                      <button onClick={() => window.open(r.screenshot_url, '_blank')} className="flex-shrink-0">
                        <img src={r.screenshot_url} alt="SS"
                          className="w-20 h-16 rounded-xl object-cover border-2 border-brand-200 shadow-sm hover:border-brand-400 transition-colors"/>
                      </button>
                    ) : (
                      <div className="w-20 h-16 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Camera size={20} className="text-gray-300"/>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-gray-900 text-sm">{r.brand || '—'}</span>
                        {r.platform && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[r.platform] || PLATFORM_COLORS.Other}`}>
                            {r.platform}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {new Date(r.report_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </span>
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
                    reportId={r.id} hostId={profile.id}
                    brand={r.brand || ''} reportDate={r.report_date}
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
