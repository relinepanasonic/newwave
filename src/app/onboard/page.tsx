'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Camera, CheckCircle2, Eye, EyeOff, AlertCircle, X, RefreshCw } from 'lucide-react'

// ── KTP Camera with frame overlay ────────────────────────────────────────────
function KTPCamera({ onCapture }: { onCapture: (base64: string) => void }) {
  const [mode, setMode] = useState<'idle' | 'live' | 'preview'>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [camError, setCamError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fallbackRef = useRef<HTMLInputElement>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  async function openCamera() {
    setCamError(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
      })
      streamRef.current = stream
      setMode('live')
      // attach after state update so video element is rendered
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      }, 50)
    } catch {
      // getUserMedia not available (desktop/older browser) — fall back to file input
      setCamError(true)
      fallbackRef.current?.click()
    }
  }

  function capturePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 960
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const b64 = canvas.toDataURL('image/jpeg', 0.88)
    setPreview(b64)
    setMode('preview')
    stopStream()
  }

  function retake() {
    setPreview(null)
    setMode('idle')
  }

  function confirmPhoto() {
    if (preview) { onCapture(preview); setMode('idle') }
  }

  function handleFallback(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const b64 = ev.target?.result as string
      setPreview(b64)
      setMode('preview')
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => () => stopStream(), [stopStream])

  // ── Idle state ─────────────────────────────────────────────────────────────
  if (mode === 'idle') return (
    <>
      <button type="button" onClick={openCamera}
        className="w-full bg-brand-50 border-2 border-dashed border-brand-300 rounded-2xl py-8 flex flex-col items-center gap-3 hover:bg-brand-100 transition-colors active:bg-brand-200">
        <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center">
          <Camera size={24} className="text-white"/>
        </div>
        <div className="text-center">
          <p className="font-semibold text-brand-700 text-sm">Buka Kamera</p>
          <p className="text-xs text-brand-500 mt-0.5">Foto KTP kamu sekarang</p>
        </div>
      </button>
      <input ref={fallbackRef} type="file" accept="image/*" capture="environment"
        onChange={handleFallback} className="hidden"/>
    </>
  )

  // ── Live camera with KTP frame overlay ─────────────────────────────────────
  if (mode === 'live') return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '3/4' }}>
      <video ref={videoRef} playsInline muted
        className="absolute inset-0 w-full h-full object-cover"/>
      <canvas ref={canvasRef} className="hidden"/>

      {/* dark overlay with transparent KTP cutout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {/* top shade */}
        <div className="w-full bg-black/55" style={{ height: '18%' }}/>
        {/* middle row: side shade | clear KTP window | side shade */}
        <div className="flex w-full" style={{ height: '42%' }}>
          <div className="bg-black/55" style={{ width: '5%' }}/>
          <div className="relative flex-1 border-2 border-white/30 rounded-sm">
            {/* red corner brackets */}
            {[['top-0 left-0','border-t-2 border-l-2'],['top-0 right-0','border-t-2 border-r-2'],
              ['bottom-0 left-0','border-b-2 border-l-2'],['bottom-0 right-0','border-b-2 border-r-2']
            ].map(([pos, cls], i) => (
              <span key={i} className={`absolute ${pos} w-6 h-6 border-red-500 ${cls}`}/>
            ))}
          </div>
          <div className="bg-black/55" style={{ width: '5%' }}/>
        </div>
        {/* bottom shade with instruction */}
        <div className="w-full flex-1 bg-black/55 flex flex-col items-center justify-start pt-2 px-4">
          <p className="text-white text-xs text-center leading-tight">
            Pastikan seluruh KTP berada dalam bingkai,{'\n'}informasi terlihat jelas, dan tidak buram.
          </p>
        </div>
      </div>

      {/* close button */}
      <button type="button" onClick={() => { stopStream(); setMode('idle') }}
        className="absolute top-3 right-3 w-9 h-9 bg-black/50 rounded-full flex items-center justify-center text-white">
        <X size={18}/>
      </button>

      {/* capture button */}
      <button type="button" onClick={capturePhoto}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full border-4 border-white bg-white/20 flex items-center justify-center active:bg-white/40">
        <div className="w-11 h-11 bg-white rounded-full"/>
      </button>
    </div>
  )

  // ── Preview after capture ───────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <canvas ref={canvasRef} className="hidden"/>
      <div className="relative">
        <img src={preview!} alt="KTP" className="w-full rounded-xl border border-gray-200 object-cover max-h-52"/>
      </div>
      <p className="text-xs text-gray-500 text-center">Foto KTP sudah diambil. Sudah jelas?</p>
      <div className="flex gap-2">
        <button type="button" onClick={retake}
          className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw size={14}/> Foto Ulang
        </button>
        <button type="button" onClick={confirmPhoto}
          className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700">
          ✓ Gunakan Foto Ini
        </button>
      </div>
    </div>
  )
}

interface Invite {
  id: string; token: string; name: string; tipe_host: string
  target_hours: number; hourly_rate: number; status: string
}

function OnboardForm() {
  const params = useSearchParams()
  const token = params.get('token') || ''

  const [invite, setInvite] = useState<Invite | null>(null)
  const [inviteError, setInviteError] = useState('')
  const [loadingInvite, setLoadingInvite] = useState(true)

  const [form, setForm] = useState({
    full_name: '', username: '', alamat: '', nik_id: '', email: '', password: '', confirm_password: '',
  })
  const [ktpBase64, setKtpBase64] = useState<string | null>(null)
  const [ktpPreview, setKtpPreview] = useState<string | null>(null)
  const [showPass, setShowPass] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)
  // Load invite
  useEffect(() => {
    if (!token) { setInviteError('Link tidak valid — token tidak ditemukan.'); setLoadingInvite(false); return }
    const supabase = createClient()
    supabase.from('onboarding_invites').select('*').eq('token', token).eq('status', 'pending').single()
      .then(({ data, error }) => {
        setLoadingInvite(false)
        if (error || !data) { setInviteError('Link tidak valid atau sudah digunakan.'); return }
        setInvite(data)
        setForm(f => ({ ...f, full_name: data.name }))
      })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')

    if (form.password !== form.confirm_password) { setSubmitError('Password tidak cocok'); return }
    if (form.password.length < 6) { setSubmitError('Password minimal 6 karakter'); return }
    if (form.nik_id.length !== 16) { setSubmitError('NIK harus 16 digit'); return }
    if (!ktpBase64) { setSubmitError('Foto KTP wajib diambil'); return }

    setSubmitting(true)
    const res = await fetch('/api/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        full_name: form.full_name,
        username: form.username || null,
        alamat: form.alamat,
        nik_id: form.nik_id,
        email: form.email,
        password: form.password,
        ktp_base64: ktpBase64,
      }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) { setSubmitError(data.error || 'Terjadi kesalahan'); return }
    setSuccess(true)
  }

  function fmtRp(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
  }

  // Loading
  if (loadingInvite) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center">
        <div className="text-brand-600 text-sm">Memuat...</div>
      </div>
    )
  }

  // Invalid token
  if (inviteError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 max-w-sm w-full text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-3"/>
          <h2 className="font-bold text-gray-900 mb-2">Link Tidak Valid</h2>
          <p className="text-sm text-gray-500">{inviteError}</p>
          <p className="text-xs text-gray-400 mt-3">Hubungi HRD untuk mendapatkan link baru.</p>
        </div>
      </div>
    )
  }

  // Success
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-emerald-600"/>
          </div>
          <h2 className="font-bold text-gray-900 text-xl mb-2">Pendaftaran Berhasil! 🎉</h2>
          <p className="text-sm text-gray-600 mb-4">
            Akunmu sudah aktif. Login sekarang dengan email dan password yang kamu buat.
          </p>
          <a href="/login"
            className="block w-full bg-brand-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-brand-700 text-center">
            Login Sekarang →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 py-8 px-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-lg">NW</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">New Wave Live Specialist</h1>
          <p className="text-sm text-gray-500 mt-1">Formulir Onboarding Host</p>
        </div>

        {/* Invite info card */}
        {invite && (
          <div className="bg-brand-600 text-white rounded-2xl p-4 mb-5">
            <p className="text-xs text-brand-200 font-medium uppercase tracking-wide mb-2">Info Pekerjaan</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] text-brand-300">Tipe Host</p>
                <p className="font-bold text-sm">{invite.tipe_host}</p>
              </div>
              <div>
                <p className="text-[10px] text-brand-300">Fee/Jam</p>
                <p className="font-bold text-sm">{fmtRp(invite.hourly_rate)}</p>
              </div>
              <div>
                <p className="text-[10px] text-brand-300">Target Live</p>
                <p className="font-bold text-sm">{invite.target_hours} jam</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Section 1: Data Pribadi */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-bold text-gray-900 text-sm mb-4 pb-2 border-b border-gray-100">
              📋 Data Pribadi
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Nama Lengkap <span className="text-red-500">*</span>
                </label>
                <input value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))}
                  required placeholder="Nama sesuai KTP"
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Nama Panggilan (Username) <span className="text-red-500">*</span>
                </label>
                <input value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))}
                  required placeholder="e.g. Anggi, Naya, Koko"
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                <p className="text-[10px] text-gray-400 mt-1">Nama pendek yang dipakai sehari-hari di jadwal</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Alamat Lengkap <span className="text-red-500">*</span>
                </label>
                <textarea value={form.alamat} onChange={e => setForm(f => ({...f, alamat: e.target.value}))}
                  required rows={3} placeholder="Jl. ... RT/RW ... Kec. ... Kab/Kota ... Prov. ..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  NIK (Nomor KTP) <span className="text-red-500">*</span>
                </label>
                <input value={form.nik_id}
                  onChange={e => setForm(f => ({...f, nik_id: e.target.value.replace(/\D/g, '').slice(0, 16)}))}
                  required maxLength={16} inputMode="numeric" placeholder="16 digit nomor KTP"
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 font-mono tracking-wider"/>
                <p className="text-[10px] text-gray-400 mt-1">{form.nik_id.length}/16 digit</p>
              </div>
            </div>
          </div>

          {/* Section 2: Foto KTP */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-bold text-gray-900 text-sm mb-1">
              📷 Foto KTP <span className="text-red-500">*</span>
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Wajib foto langsung menggunakan kamera HP — posisikan KTP dalam bingkai
            </p>
            {ktpPreview ? (
              <div className="space-y-2">
                <div className="relative">
                  <img src={ktpPreview} alt="KTP" className="w-full rounded-xl border border-gray-200 object-cover max-h-48"/>
                  <button type="button" onClick={() => { setKtpBase64(null); setKtpPreview(null) }}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1">
                    ✕
                  </button>
                </div>
                <p className="text-xs text-emerald-600 text-center font-medium">✓ Foto KTP berhasil diambil</p>
              </div>
            ) : (
              <KTPCamera onCapture={(b64) => { setKtpBase64(b64); setKtpPreview(b64) }}/>
            )}
          </div>

          {/* Section 3: Akun Login */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-bold text-gray-900 text-sm mb-4 pb-2 border-b border-gray-100">
              🔐 Buat Akun Login
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Email <span className="text-red-500">*</span>
                </label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                  required placeholder="emailkamu@gmail.com" autoComplete="email"
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={form.password}
                    onChange={e => setForm(f => ({...f, password: e.target.value}))}
                    required minLength={6} placeholder="Min 6 karakter" autoComplete="new-password"
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Konfirmasi Password <span className="text-red-500">*</span>
                </label>
                <input type={showPass ? 'text' : 'password'} value={form.confirm_password}
                  onChange={e => setForm(f => ({...f, confirm_password: e.target.value}))}
                  required placeholder="Ulangi password" autoComplete="new-password"
                  className={`w-full border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                    form.confirm_password && form.password !== form.confirm_password
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-200'
                  }`}/>
              </div>
            </div>
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5"/>
              <p className="text-xs text-red-700">{submitError}</p>
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full bg-brand-600 text-white py-4 rounded-2xl font-bold text-sm hover:bg-brand-700 disabled:opacity-60 shadow-lg shadow-brand-200">
            {submitting ? 'Mendaftarkan...' : '✓ Daftar Sekarang'}
          </button>

          <p className="text-xs text-gray-400 text-center pb-4">
            Dengan mendaftar, kamu menyetujui ketentuan kerja New Wave Live Specialist.
          </p>
        </form>
      </div>
    </div>
  )
}

export default function OnboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center">
        <div className="text-brand-600 text-sm">Memuat...</div>
      </div>
    }>
      <OnboardForm />
    </Suspense>
  )
}
