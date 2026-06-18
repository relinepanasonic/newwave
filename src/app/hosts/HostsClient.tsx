'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { Plus, X, Save, Pencil, Link2, Copy, Check, ChevronUp, ChevronDown, Clock, UserCheck, UserX } from 'lucide-react'

const TIPE_HOST = ['Regular', 'Senior', 'Part-time', 'Contract', 'Probation']

interface Profile {
  id: string; full_name: string; role: string; hourly_rate: number
  phone?: string; client_brand?: string; is_active: boolean; tipe_host?: string; target_hours?: number
}
interface Invite {
  id: string; token: string; name: string; tipe_host: string
  target_hours: number; hourly_rate: number; status: string
  created_at: string; used_at?: string; host_id?: string
}

export default function HostsClient({ profile }: { profile: any }) {
  const [hosts, setHosts] = useState<Profile[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [tab, setTab] = useState<'host' | 'client'>('host')
  const [loading, setLoading] = useState(true)

  // Invite form
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState({ name: '', tipe_host: 'Regular', target_hours: 155, hourly_rate: 0 })
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Edit existing host/client
  const [editModal, setEditModal] = useState<Profile | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', hourly_rate: 0, phone: '', client_brand: '', tipe_host: '', target_hours: 155, is_active: true })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Add client (old flow)
  const [clientModal, setClientModal] = useState(false)
  const [clientForm, setClientForm] = useState({ full_name: '', hourly_rate: 0, phone: '', client_brand: '', email: '', password: '' })
  const [clientSaving, setClientSaving] = useState(false)
  const [clientError, setClientError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('profiles').select('*').in('role', ['host', 'client']).order('full_name'),
      supabase.from('onboarding_invites').select('*').order('created_at', { ascending: false }),
    ]).then(([hostsRes, invitesRes]) => {
      setHosts(hostsRes.data || [])
      setInvites(invitesRes.data || [])
      setLoading(false)
    })
  }, [])

  // ── Invite ──────────────────────────────────────────────────
  async function createInvite() {
    setInviteSaving(true); setInviteError('')
    const supabase = createClient()
    const { data, error } = await supabase
      .from('onboarding_invites')
      .insert({
        name: inviteForm.name,
        tipe_host: inviteForm.tipe_host,
        target_hours: inviteForm.target_hours,
        hourly_rate: inviteForm.hourly_rate,
        created_by: profile.id,
      })
      .select().single()
    setInviteSaving(false)
    if (error) { setInviteError(error.message); return }
    const link = `${window.location.origin}/onboard?token=${data.token}`
    setGeneratedLink(link)
    setInvites(prev => [data, ...prev])
  }

  function copyLink(link: string) {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function resetInviteModal() {
    setShowInviteModal(false)
    setGeneratedLink(null)
    setInviteForm({ name: '', tipe_host: 'Regular', target_hours: 155, hourly_rate: 0 })
    setInviteError('')
  }

  // ── Edit host/client ─────────────────────────────────────────
  function openEdit(h: Profile) {
    setEditForm({
      full_name: h.full_name, hourly_rate: h.hourly_rate || 0,
      phone: h.phone || '', client_brand: h.client_brand || '',
      tipe_host: h.tipe_host || '', target_hours: h.target_hours || 155,
      is_active: h.is_active,
    })
    setEditModal(h); setEditError('')
  }

  async function saveEdit() {
    if (!editModal) return
    setEditSaving(true); setEditError('')
    const supabase = createClient()
    const { data, error } = await supabase.from('profiles')
      .update({
        full_name: editForm.full_name,
        hourly_rate: editForm.hourly_rate,
        phone: editForm.phone,
        client_brand: editForm.client_brand || null,
        tipe_host: editForm.tipe_host || null,
        target_hours: editForm.target_hours,
        is_active: editForm.is_active,
      })
      .eq('id', editModal.id).select().single()
    setEditSaving(false)
    if (error) { setEditError(error.message); return }
    setHosts(prev => prev.map(h => h.id === editModal.id ? data : h))
    setEditModal(null)
  }

  async function toggleActive(h: Profile) {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').update({ is_active: !h.is_active }).eq('id', h.id).select().single()
    if (data) setHosts(prev => prev.map(p => p.id === h.id ? data : p))
  }

  // ── Add client ───────────────────────────────────────────────
  async function saveClient() {
    setClientSaving(true); setClientError('')
    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...clientForm, role: 'client' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setHosts(prev => [...prev, data.profile])
      setClientModal(false)
      setClientForm({ full_name: '', hourly_rate: 0, phone: '', client_brand: '', email: '', password: '' })
    } catch (e: any) {
      setClientError(e.message)
    }
    setClientSaving(false)
  }

  const filteredHosts = hosts.filter(h => h.role === 'host')
  const filteredClients = hosts.filter(h => h.role === 'client')
  const pendingInvites = invites.filter(i => i.status === 'pending')
  const completedInvites = invites.filter(i => i.status === 'completed')

  return (
    <AppShell role="superadmin" userName={profile.full_name}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>
            <p className="text-sm text-gray-500 mt-0.5">Kelola Host & Client</p>
          </div>
          {tab === 'host' ? (
            <button onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl">
              <Link2 size={14}/> Buat Link Onboarding
            </button>
          ) : (
            <button onClick={() => setClientModal(true)}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl">
              <Plus size={14}/> Tambah Client
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
          {(['host', 'client'] as const).map(r => (
            <button key={r} onClick={() => setTab(r)}
              className={cn('px-5 py-2 rounded-lg text-sm font-medium transition-colors',
                tab === r ? 'bg-white shadow-sm text-brand-700' : 'text-gray-500 hover:text-gray-700')}>
              {r === 'host' ? 'Host' : 'Client'} ({r === 'host' ? filteredHosts.length : filteredClients.length})
            </button>
          ))}
        </div>

        {tab === 'host' && (
          <>
            {/* Pending invites */}
            {pendingInvites.length > 0 && (
              <div className="mb-5">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <Clock size={12}/> Link Onboarding Pending ({pendingInvites.length})
                </h2>
                <div className="space-y-2">
                  {pendingInvites.map(inv => {
                    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/onboard?token=${inv.token}`
                    return (
                      <div key={inv.id} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm">{inv.name}</p>
                          <p className="text-xs text-gray-500">{inv.tipe_host} · {formatCurrency(inv.hourly_rate)}/jam · {inv.target_hours} jam target</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-semibold">Belum diisi</span>
                          <button onClick={() => copyLink(link)}
                            className="flex items-center gap-1.5 text-xs bg-white border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-100 font-medium">
                            <Copy size={11}/> Salin Link
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Active hosts */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <UserCheck size={14} className="text-emerald-600"/>
                <span className="text-sm font-semibold text-gray-700">Host Aktif ({filteredHosts.length})</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-3 text-left font-semibold">Nama</th>
                    <th className="px-4 py-3 text-left font-semibold">Tipe</th>
                    <th className="px-4 py-3 text-right font-semibold">Tarif/Jam</th>
                    <th className="px-4 py-3 text-center font-semibold">Target</th>
                    <th className="px-4 py-3 text-center font-semibold">Status</th>
                    <th className="px-4 py-3 text-center font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">Memuat...</td></tr>
                  ) : filteredHosts.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                      Belum ada host — buat link onboarding di atas
                    </td></tr>
                  ) : filteredHosts.map(h => (
                    <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900">{h.full_name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{h.tipe_host || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-medium">{formatCurrency(h.hourly_rate || 0)}</td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">{h.target_hours || 155} jam</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleActive(h)}
                          className={cn('text-xs px-2.5 py-0.5 rounded-full font-medium',
                            h.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                          {h.is_active ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => openEdit(h)} className="p-1.5 rounded-lg hover:bg-brand-50 text-brand-600">
                          <Pencil size={14}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'client' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-semibold">Nama</th>
                  <th className="px-4 py-3 text-left font-semibold">Brand</th>
                  <th className="px-4 py-3 text-left font-semibold">Telepon</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">Memuat...</td></tr>
                ) : filteredClients.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">Belum ada client</td></tr>
                ) : filteredClients.map(h => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{h.full_name}</td>
                    <td className="px-4 py-3 text-gray-600">{h.client_brand || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{h.phone || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive(h)}
                        className={cn('text-xs px-2.5 py-0.5 rounded-full font-medium',
                          h.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                        {h.is_active ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => openEdit(h)} className="p-1.5 rounded-lg hover:bg-brand-50 text-brand-600">
                        <Pencil size={14}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Invite Modal ── */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={resetInviteModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>

            {generatedLink ? (
              // Show generated link
              <div className="p-6">
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Link2 size={20} className="text-emerald-600"/>
                </div>
                <h3 className="font-bold text-gray-900 text-center mb-1">Link Onboarding Siap!</h3>
                <p className="text-xs text-gray-500 text-center mb-4">Kirim link ini ke <strong>{inviteForm.name}</strong> via WhatsApp</p>

                <div className="bg-gray-50 rounded-xl p-3 mb-4">
                  <p className="text-xs text-gray-600 break-all font-mono">{generatedLink}</p>
                </div>

                <button onClick={() => copyLink(generatedLink)}
                  className={cn('w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors',
                    copied ? 'bg-emerald-600 text-white' : 'bg-brand-600 text-white hover:bg-brand-700')}>
                  {copied ? <><Check size={14}/> Tersalin!</> : <><Copy size={14}/> Salin Link</>}
                </button>

                <button onClick={resetInviteModal}
                  className="w-full mt-2 py-2.5 text-sm text-gray-500 hover:text-gray-700">
                  Selesai
                </button>
              </div>
            ) : (
              // Invite form
              <>
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">Buat Link Onboarding Host</h3>
                  <button onClick={resetInviteModal}><X size={16} className="text-gray-400"/></button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Nama Host</label>
                    <input value={inviteForm.name} onChange={e => setInviteForm(f => ({...f, name: e.target.value}))}
                      placeholder="e.g. Regina Putri"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Tipe Host</label>
                    <select value={inviteForm.tipe_host} onChange={e => setInviteForm(f => ({...f, tipe_host: e.target.value}))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                      {TIPE_HOST.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Target Live stepper */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                      Target Live per Periode
                    </label>
                    <div className="flex items-center gap-3">
                      <button type="button"
                        onClick={() => setInviteForm(f => ({...f, target_hours: Math.max(0, f.target_hours - 5)}))}
                        className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-200 text-gray-700 font-bold text-lg">
                        −
                      </button>
                      <div className="flex-1 text-center">
                        <span className="text-3xl font-bold text-brand-700">{inviteForm.target_hours}</span>
                        <span className="text-sm text-gray-400 ml-1">jam</span>
                      </div>
                      <button type="button"
                        onClick={() => setInviteForm(f => ({...f, target_hours: f.target_hours + 5}))}
                        className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-200 text-gray-700 font-bold text-lg">
                        +
                      </button>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1.5 px-1">
                      {[100, 120, 140, 155, 170, 200].map(v => (
                        <button key={v} type="button" onClick={() => setInviteForm(f => ({...f, target_hours: v}))}
                          className={cn('px-1.5 py-0.5 rounded font-medium transition-colors',
                            inviteForm.target_hours === v ? 'bg-brand-100 text-brand-700' : 'hover:text-gray-600')}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fee per jam */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Fee per Jam</label>
                    <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-400">
                      <span className="px-3 py-2.5 bg-gray-50 text-sm font-semibold text-gray-500 border-r border-gray-200">Rp</span>
                      <input type="number" min="0" step="5000" value={inviteForm.hourly_rate || ''}
                        onChange={e => setInviteForm(f => ({...f, hourly_rate: Number(e.target.value)}))}
                        placeholder="50000"
                        className="flex-1 px-3 py-2.5 text-sm focus:outline-none"/>
                    </div>
                  </div>

                  {inviteError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{inviteError}</p>}
                </div>
                <div className="px-6 pb-6 flex gap-2">
                  <button onClick={resetInviteModal}
                    className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                    Batal
                  </button>
                  <button onClick={createInvite} disabled={inviteSaving || !inviteForm.name}
                    className="flex-1 bg-brand-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2">
                    <Link2 size={14}/>{inviteSaving ? 'Membuat...' : 'Buat Link'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-gray-900">Edit — {editModal.full_name}</h3>
              <button onClick={() => setEditModal(null)}><X size={16} className="text-gray-400"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Nama Lengkap</label>
                <input value={editForm.full_name} onChange={e => setEditForm(f => ({...f, full_name: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              </div>
              {editModal.role === 'host' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Tipe Host</label>
                    <select value={editForm.tipe_host} onChange={e => setEditForm(f => ({...f, tipe_host: e.target.value}))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                      <option value="">— Pilih —</option>
                      {TIPE_HOST.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Fee per Jam</label>
                    <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-400">
                      <span className="px-3 py-2.5 bg-gray-50 text-sm font-semibold text-gray-500 border-r border-gray-200">Rp</span>
                      <input type="number" value={editForm.hourly_rate || ''}
                        onChange={e => setEditForm(f => ({...f, hourly_rate: Number(e.target.value)}))}
                        className="flex-1 px-3 py-2.5 text-sm focus:outline-none"/>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Target Live (jam)</label>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setEditForm(f => ({...f, target_hours: Math.max(0, f.target_hours - 5)}))}
                        className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-200 font-bold">−</button>
                      <span className="flex-1 text-center text-xl font-bold text-brand-700">{editForm.target_hours}</span>
                      <button type="button" onClick={() => setEditForm(f => ({...f, target_hours: f.target_hours + 5}))}
                        className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-200 font-bold">+</button>
                    </div>
                  </div>
                </>
              )}
              {editModal.role === 'client' && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Brand</label>
                  <input value={editForm.client_brand} onChange={e => setEditForm(f => ({...f, client_brand: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Telepon</label>
                <input value={editForm.phone} onChange={e => setEditForm(f => ({...f, phone: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status Aktif</span>
                <button type="button" onClick={() => setEditForm(f => ({...f, is_active: !f.is_active}))}
                  className={cn('w-10 h-6 rounded-full transition-colors relative',
                    editForm.is_active ? 'bg-brand-600' : 'bg-gray-300')}>
                  <span className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
                    editForm.is_active ? 'left-4.5' : 'left-0.5')} style={{ left: editForm.is_active ? '18px' : '2px' }}/>
                </button>
              </div>
              {editError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{editError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setEditModal(null)}
                className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                Batal
              </button>
              <button onClick={saveEdit} disabled={editSaving}
                className="flex-1 bg-brand-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2">
                <Save size={14}/>{editSaving ? '...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Client Modal ── */}
      {clientModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setClientModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-gray-900">Tambah Client Baru</h3>
              <button onClick={() => setClientModal(false)}><X size={16} className="text-gray-400"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Email</label>
                <input type="email" value={clientForm.email} onChange={e => setClientForm(f => ({...f, email: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" placeholder="email@brand.com"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Password</label>
                <input type="password" value={clientForm.password} onChange={e => setClientForm(f => ({...f, password: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" placeholder="Min 6 karakter"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Nama</label>
                <input value={clientForm.full_name} onChange={e => setClientForm(f => ({...f, full_name: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Brand</label>
                <input value={clientForm.client_brand} onChange={e => setClientForm(f => ({...f, client_brand: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" placeholder="e.g. Niko"/>
              </div>
              {clientError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{clientError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setClientModal(false)}
                className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50">Batal</button>
              <button onClick={saveClient} disabled={clientSaving}
                className="flex-1 bg-brand-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-60">
                {clientSaving ? '...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copied toast */}
      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <Check size={14} className="text-emerald-400"/> Link tersalin ke clipboard!
        </div>
      )}
    </AppShell>
  )
}
