'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { toLocalDateStr, SESSION_LABELS } from '@/lib/utils'
import { Camera, Upload, X, CheckCircle2, Sparkles, PlayCircle, Clock } from 'lucide-react'

interface Slot {
  id: string; session_no: number; brand: string; platform: string
  status: string; rooms: { name: string }
}
interface Approval {
  id: string; slot_id: string; brand: string; photo_url: string; status: string
}

export default function PraLiveClient({ profile }: { profile: any }) {
  const router = useRouter()
  const [todaySlots, setTodaySlots] = useState<Slot[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  // per-slot upload state
  const [activeSlot, setActiveSlot] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const todayStr = toLocalDateStr(new Date())
  const hostId = profile.id

  useEffect(() => {
    if (profile.role !== 'host' && profile.role !== 'superadmin') return
    const supabase = createClient()
    Promise.all([
      supabase.from('schedule_slots')
        .select('id, session_no, brand, platform, status, rooms(name)')
        .eq('slot_date', todayStr)
        .eq('host_id', hostId)
        .order('session_no'),
      supabase.from('look_approvals')
        .select('id, slot_id, brand, photo_url, status')
        .eq('host_id', hostId)
        .eq('approval_date', todayStr),
    ]).then(([slotsRes, apprRes]) => {
      setTodaySlots((slotsRes.data as unknown as Slot[]) || [])
      setApprovals((apprRes.data as Approval[]) || [])
      setLoading(false)
    })
  }, [hostId, todayStr, profile.role])

  function pickPhoto(slotId: string) {
    setActiveSlot(slotId)
    setPhotoFile(null); setPhotoPreview(null); setError('')
    setTimeout(() => fileRef.current?.click(), 50)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function submitApproval(slot: Slot) {
    if (!photoFile || activeSlot !== slot.id) return
    setSaving(true); setError('')
    const supabase = createClient()
    // upload photo
    const ext = photoFile.name.split('.').pop() || 'jpg'
    const path = `${hostId}/${todayStr}-${slot.id}-${Date.now()}.${ext}`
    const { data: up, error: upErr } = await supabase.storage
      .from('look-approvals').upload(path, photoFile, { contentType: photoFile.type, upsert: true })
    if (upErr) { setError('Upload gagal: ' + upErr.message); setSaving(false); return }
    const { data: urlData } = supabase.storage.from('look-approvals').getPublicUrl(up.path)

    const { data, error: insErr } = await supabase.from('look_approvals').insert({
      host_id: hostId,
      slot_id: slot.id,
      approval_date: todayStr,
      brand: slot.brand || null,
      photo_url: urlData.publicUrl,
      status: 'submitted',
    }).select().single()
    setSaving(false)
    if (insErr) { setError(insErr.message); return }
    setApprovals(prev => [...prev, data as Approval])
    setActiveSlot(null); setPhotoFile(null); setPhotoPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const approvalBySlot = (slotId: string) => approvals.find(a => a.slot_id === slotId)

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-5 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles size={20} className="text-brand-600"/> Pra-Live — Look Approval
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload foto makeup/look kamu untuk tiap sesi sebelum mulai live.
          </p>
        </div>

        {/* hidden file input shared by all cards */}
        <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handleFile} className="hidden"/>

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-400">Memuat jadwal hari ini...</div>
        ) : todaySlots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <Clock size={28} className="text-gray-300 mx-auto mb-2"/>
            <p className="text-sm font-medium text-gray-400">Tidak ada jadwal live untuk kamu hari ini</p>
          </div>
        ) : (
          <div className="space-y-4">
            {todaySlots.map(slot => {
              const appr = approvalBySlot(slot.id)
              const isActive = activeSlot === slot.id
              return (
                <div key={slot.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{slot.brand || 'Tanpa Brand'}</p>
                      <p className="text-xs text-gray-400">{SESSION_LABELS[slot.session_no]} · {slot.rooms?.name}</p>
                    </div>
                    {appr ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                        <CheckCircle2 size={13}/> Look dikirim
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">Belum upload</span>
                    )}
                  </div>

                  <div className="p-5">
                    {appr ? (
                      // Already submitted → show photo + Start Live
                      <div className="flex items-center gap-4">
                        <img src={appr.photo_url} alt="Look" className="w-20 h-20 rounded-xl object-cover border-2 border-emerald-200"/>
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 mb-2">Look approval sudah dikirim. Kamu bisa mulai live.</p>
                          <button onClick={() => router.push(`/live-report?slot=${slot.id}`)}
                            className="inline-flex items-center gap-2 bg-brand-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-brand-700 transition-colors">
                            <PlayCircle size={16}/> Start Live
                          </button>
                        </div>
                      </div>
                    ) : isActive && photoPreview ? (
                      // Previewing chosen photo for this slot
                      <div className="space-y-3">
                        <div className="relative inline-block">
                          <img src={photoPreview} alt="Preview" className="rounded-xl border border-gray-200 max-h-56 object-contain"/>
                          <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow">
                            <X size={12}/>
                          </button>
                        </div>
                        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                        <div className="flex gap-2">
                          <button onClick={() => submitApproval(slot)} disabled={saving}
                            className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
                            {saving ? 'Mengirim...' : '✓ Kirim Look Approval'}
                          </button>
                          <button onClick={() => pickPhoto(slot.id)} disabled={saving}
                            className="px-4 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                            Ganti Foto
                          </button>
                        </div>
                      </div>
                    ) : (
                      // No photo yet → upload prompt
                      <button onClick={() => pickPhoto(slot.id)}
                        className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
                        <Upload size={24} className="text-gray-300"/>
                        <p className="text-sm text-gray-400 font-medium">Upload / foto look makeup</p>
                        <p className="text-xs text-gray-300">Wajib sebelum Start Live</p>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
