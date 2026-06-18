'use client'
import { useState } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Plus, X, Save, GripVertical } from 'lucide-react'
import { tr, type Lang } from '@/lib/i18n'

interface Room { id: string; name: string; group_name: string; sort_order: number; is_active: boolean }
interface Props { profile: { full_name: string; role: string }; rooms: Room[] }

const GROUPS = ['Jakarta Puan', 'Luar Puan']

export default function RoomsClient({ profile, rooms: initial }: Props) {
  const [lang] = useState<Lang>('id')
  const [rooms, setRooms] = useState<Room[]>(initial)
  const [modal, setModal] = useState<Room | 'new' | null>(null)
  const [form, setForm] = useState({ name: '', group_name: 'Jakarta Puan' })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const supabase = createClient()
    if (modal === 'new') {
      const { data } = await supabase.from('rooms').insert({ ...form, sort_order: rooms.length + 1 }).select().single()
      if (data) setRooms(prev => [...prev, data])
    } else if (modal) {
      const { data } = await supabase.from('rooms').update(form).eq('id', modal.id).select().single()
      if (data) setRooms(prev => prev.map(r => r.id === modal.id ? data : r))
    }
    setSaving(false)
    setModal(null)
  }

  async function toggleActive(r: Room) {
    const supabase = createClient()
    const { data } = await supabase.from('rooms').update({ is_active: !r.is_active }).eq('id', r.id).select().single()
    if (data) setRooms(prev => prev.map(room => room.id === r.id ? data : room))
  }

  const groups = GROUPS.map(g => ({ name: g, rooms: rooms.filter(r => r.group_name === g) }))

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{tr('rooms', lang)}</h1>
          <button onClick={() => { setForm({ name: '', group_name: 'Jakarta Puan' }); setModal('new') }}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-xl">
            <Plus size={15}/> {lang === 'id' ? 'Tambah Ruangan' : 'Add Room'}
          </button>
        </div>

        {groups.map(({ name, rooms: groupRooms }) => (
          <div key={name} className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{name}</h2>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {groupRooms.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-400">Belum ada ruangan</p>
              ) : groupRooms.map(room => (
                <div key={room.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <GripVertical size={14} className="text-gray-300 flex-shrink-0"/>
                  <p className="flex-1 font-medium text-gray-900">{room.name}</p>
                  <button onClick={() => toggleActive(room)}
                    className={cn('text-xs px-2.5 py-0.5 rounded-full font-medium',
                      room.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                    {room.is_active ? 'Aktif' : 'Nonaktif'}
                  </button>
                  <button onClick={() => { setForm({ name: room.name, group_name: room.group_name }); setModal(room) }}
                    className="text-xs text-brand-600 border border-brand-200 rounded-lg px-2.5 py-1 hover:bg-brand-50">
                    {tr('edit', lang)}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-gray-900">{modal === 'new' ? 'Tambah Ruangan' : 'Edit Ruangan'}</h3>
              <button onClick={() => setModal(null)}><X size={16} className="text-gray-400"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1">Nama Ruangan</label>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" placeholder="e.g. Puan 4"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1">Grup</label>
                <select value={form.group_name} onChange={e => setForm(f => ({...f, group_name: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                  {GROUPS.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 border border-gray-200 rounded-xl py-2 text-sm text-gray-600 hover:bg-gray-50">{tr('cancel', lang)}</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-brand-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-brand-700 flex items-center justify-center gap-2 disabled:opacity-60">
                <Save size={14}/>{saving ? '...' : tr('save', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
