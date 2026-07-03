'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPayPeriod, toLocalDateStr, PLATFORM_COLORS } from '@/lib/utils'
import { Camera, Filter } from 'lucide-react'

function getPeriodOptions() {
  const opts = []
  for (let i = 0; i < 4; i++) {
    const d = new Date()
    if (i > 0) d.setMonth(d.getMonth() - i)
    const p = getPayPeriod(d)
    opts.push({ label: p.label, start: toLocalDateStr(p.start), end: toLocalDateStr(p.end) })
  }
  return opts
}

interface LogSlot {
  id: string; slot_date: string; session_no: number
  brand: string; platform: string; jam_mulai?: string
  look_approval_at: string; look_approval_url?: string
  rooms: { name: string }
  profiles: { full_name: string } | null
}

interface Host { id: string; full_name: string }

export default function LookApprovalLogTab({ profile: _profile }: { profile: any }) {
  const [slots, setSlots] = useState<LogSlot[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [loading, setLoading] = useState(true)
  const [periodIdx, setPeriodIdx] = useState(0)
  const [selectedHost, setSelectedHost] = useState('')

  const periodOptions = getPeriodOptions()
  const period = periodOptions[periodIdx]

  const fetchData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    let q = supabase.from('schedule_slots')
      .select('id, slot_date, session_no, brand, platform, jam_mulai, look_approval_at, look_approval_url, rooms:room_id(name), profiles:host_id(full_name)')
      .not('look_approval_at', 'is', null)
      .gte('slot_date', period.start)
      .lte('slot_date', period.end)
      .order('slot_date', { ascending: false })
      .order('look_approval_at', { ascending: false })

    if (selectedHost) q = q.eq('host_id', selectedHost)

    const [slotsRes, hostsRes] = await Promise.all([
      q,
      supabase.from('profiles').select('id, full_name').eq('role', 'host').eq('is_active', true).order('full_name'),
    ])

    setSlots((slotsRes.data as unknown as LogSlot[]) || [])
    setHosts(hostsRes.data || [])
    setLoading(false)
  }, [period.start, period.end, selectedHost])

  useEffect(() => { fetchData() }, [fetchData])

  const onTime = slots.filter(s => {
    const approvalTime = new Date(s.look_approval_at)
    const sessionStart = s.jam_mulai
      ? new Date(`${s.slot_date}T${s.jam_mulai}`)
      : new Date(`${s.slot_date}T${String(s.session_no - 1).padStart(2, '0')}:00:00`)
    return approvalTime <= sessionStart
  }).length

  return (
    <div className="max-w-5xl mx-auto">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400"/>
          <span className="text-xs text-gray-500 font-medium">Filter:</span>
        </div>
        <select value={periodIdx} onChange={e => setPeriodIdx(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
          {periodOptions.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
        </select>
        <select value={selectedHost} onChange={e => setSelectedHost(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white min-w-[160px]">
          <option value="">Semua Host</option>
          {hosts.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total Approval', value: slots.length, color: 'bg-brand-50 border-brand-100 text-brand-700' },
          { label: 'Tepat Waktu', value: onTime, color: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
          { label: 'Terlambat', value: slots.length - onTime, color: 'bg-red-50 border-red-100 text-red-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-2xl border p-4 ${color}`}>
            <p className="text-xs opacity-70 font-medium">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Log list */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">Memuat...</div>
      ) : slots.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          Tidak ada data Look Approval untuk periode ini
        </div>
      ) : (
        <div className="space-y-2">
          {slots.map(slot => {
            const approvalTime = new Date(slot.look_approval_at)
            const sessionStart = slot.jam_mulai
              ? new Date(`${slot.slot_date}T${slot.jam_mulai}`)
              : new Date(`${slot.slot_date}T${String(slot.session_no - 1).padStart(2, '0')}:00:00`)
            const isLate = approvalTime > sessionStart
            const approvalFmt = approvalTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            const dateFmt = new Date(slot.slot_date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

            return (
              <div key={slot.id} className={`bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3 ${isLate ? 'border-red-100' : 'border-emerald-100'}`}>
                {slot.look_approval_url ? (
                  <button onClick={() => window.open(slot.look_approval_url, '_blank')} className="flex-shrink-0">
                    <img src={slot.look_approval_url} alt="Look"
                      className={`w-14 h-14 rounded-xl object-cover border-2 ${isLate ? 'border-red-200' : 'border-emerald-200'}`}/>
                  </button>
                ) : (
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${isLate ? 'bg-red-50' : 'bg-emerald-50'}`}>
                    <Camera size={20} className={isLate ? 'text-red-300' : 'text-emerald-300'}/>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-bold text-gray-900 text-sm">{slot.profiles?.full_name || '—'}</span>
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-sm text-gray-700">{slot.brand || '—'}</span>
                    {slot.platform && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[slot.platform] || PLATFORM_COLORS.Other}`}>
                        {slot.platform}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{dateFmt} · {(slot.rooms as any)?.name}</p>
                  <p className={`text-xs font-semibold mt-0.5 ${isLate ? 'text-red-600' : 'text-emerald-600'}`}>
                    {isLate ? '🔴 Terlambat' : '✅ Tepat Waktu'} · Approval {approvalFmt}
                    {slot.jam_mulai && ` (sesi mulai ${slot.jam_mulai.slice(0, 5)})`}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
