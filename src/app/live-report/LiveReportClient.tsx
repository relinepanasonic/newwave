'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getPayPeriod, toLocalDateStr, SESSION_LABELS, PLATFORM_COLORS, formatCurrency } from '@/lib/utils'
import { Upload, X, CheckCircle2, Camera, TrendingUp, ChevronDown } from 'lucide-react'

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
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </AppShell>
  )
}
