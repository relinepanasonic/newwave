'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lang, setLang] = useState<'id' | 'en'>('id')
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(lang === 'id' ? 'Email atau kata sandi salah.' : 'Invalid email or password.')
      setLoading(false)
    } else {
      window.location.replace('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-purple-50">
      {/* Lang toggle */}
      <button
        onClick={() => setLang(l => l === 'id' ? 'en' : 'id')}
        className="fixed top-4 right-4 text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-full shadow-sm text-gray-600 hover:border-brand-400"
      >
        {lang === 'id' ? '🇺🇸 EN' : '🇮🇩 ID'}
      </button>

      <div className="w-full max-w-sm mx-4">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl shadow-lg mb-4">
            <span className="text-white text-2xl font-bold">NW</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">New Wave Live Specialist</h1>
          <p className="text-sm text-gray-500 mt-1">
            {lang === 'id' ? 'Masuk ke akun Anda' : 'Sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-lg p-6 space-y-4 border border-gray-100">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              {lang === 'id' ? 'Email' : 'Email'}
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="host@newwave.id"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              {lang === 'id' ? 'Kata Sandi' : 'Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {loading
              ? (lang === 'id' ? 'Memuat...' : 'Loading...')
              : (lang === 'id' ? 'Masuk' : 'Login')}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          © 2026 New Wave Live Specialist
        </p>
      </div>
    </div>
  )
}
