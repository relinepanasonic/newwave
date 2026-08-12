'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Eye, EyeOff, AlertCircle, Building2 } from 'lucide-react'

interface Invite { id: string; token: string; name: string; client_brand: string | null; role: string }

function OnboardClientInner() {
  const params = useSearchParams()
  const token = params.get('token')

  const [invite, setInvite] = useState<Invite | null>(null)
  const [checking, setChecking] = useState(true)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', phone: '' })
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) { setChecking(false); return }
    createClient().from('onboarding_invites')
      .select('id, token, name, client_brand, role')
      .eq('token', token).eq('status', 'pending').single()
      .then(({ data }) => {
        if (data && data.role === 'client') {
          setInvite(data as Invite)
          setForm(f => ({ ...f, full_name: data.name || '' }))
        }
        setChecking(false)
      })
  }, [token])

  async function submit() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/onboard-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...form }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal mendaftar')
      setDone(true)
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Memuat...</div>
  }

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-sm text-center">
          <AlertCircle size={32} className="text-red-400 mx-auto mb-3"/>
          <p className="font-bold text-gray-900 mb-1">Link tidak valid</p>
          <p className="text-sm text-gray-500">Link pendaftaran ini sudah dipakai atau sudah tidak berlaku. Hubungi tim New Wave untuk link baru.</p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-sm text-center">
          <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-3"/>
          <p className="font-bold text-gray-900 mb-1">Akun berhasil dibuat</p>
          <p className="text-sm text-gray-500 mb-5">
            Sekarang kamu bisa masuk memakai email &amp; password yang tadi dibuat.
          </p>
          <a href="/login" className="inline-block bg-brand-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-700">
            Masuk ke Aplikasi
          </a>
        </div>
      </div>
    )
  }

  const canSubmit = form.full_name.trim() && form.email.trim() && form.password.length >= 6

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7 w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Building2 size={17} className="text-brand-600"/>
          </div>
          <div>
            <h1 className="font-bold text-gray-900">Daftar Akun Client</h1>
            <p className="text-xs text-gray-400">New Wave Live Specialist</p>
          </div>
        </div>
        <div className="bg-brand-50 border border-brand-100 rounded-xl px-3.5 py-2.5 my-4">
          <p className="text-[10px] font-bold text-brand-500 uppercase tracking-widest">Brand</p>
          <p className="text-sm font-bold text-brand-800">{invite.client_brand || '—'}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Nama</label>
            <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="email@brand.com"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Password</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min 6 karakter"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              <button type="button" onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">No. Telepon (opsional)</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <button onClick={submit} disabled={saving || !canSubmit}
          className="w-full mt-5 bg-brand-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Membuat akun...' : 'Buat Akun'}
        </button>
      </div>
    </div>
  )
}

export default function OnboardClientPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Memuat...</div>}>
      <OnboardClientInner/>
    </Suspense>
  )
}
