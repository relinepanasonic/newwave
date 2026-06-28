'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { SESSION_LABELS, PLATFORM_COLORS, getWeekDates, toLocalDateStr, cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, ChevronDown, X, Save, Plus, Trash2, Copy } from 'lucide-react'
import { tr } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'
import TimeInput from '@/components/TimeInput'

const DAYS_ID = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu']
const DAYS_EN = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const PLATFORMS = ['Shopee','TikTok','Instagram','YouTube','Other']

// Sessions grouped by time of day. Session N covers hour (N-1):00–N:00,
// so Morning = sessions 1–8 (00–08), Afternoon = 9–16 (08–16), Night = 17–24 (16–24).
const TIME_GROUPS = [
  { key: 'morning',   label: 'Morning',   sub: '00:00 – 08:00', sessions: [1, 2, 3, 4, 5, 6, 7, 8] },
  { key: 'afternoon', label: 'Afternoon', sub: '08:00 – 16:00', sessions: [9, 10, 11, 12, 13, 14, 15, 16] },
  { key: 'night',     label: 'Night',     sub: '16:00 – 00:00', sessions: [17, 18, 19, 20, 21, 22, 23, 24] },
] as const

function currentTimeGroup(): string {
  const h = new Date().getHours()
  return h < 8 ? 'morning' : h < 16 ? 'afternoon' : 'night'
}

interface Room { id: string; name: string; group_name: string; sort_order: number }
interface Host { id: string; full_name: string; username?: string }
interface Slot {
  id?: string; slot_date: string; session_no: number; room_id: string
  host_id?: string; brand?: string; platform?: string; konsep?: string
  background?: string; kostum?: string; gimmick?: string; status?: string
  jam_mulai?: string; durasi?: number
}

interface Blackout {
  id: string; brand: string; platform: string | null
  day_of_week: number[] | null; start_time: string; end_time: string; reason: string | null
}

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Core blackout checker — works with any start/end in minutes
function checkBlackoutConflict(
  blackouts: Blackout[], brand: string, platform: string,
  slotStartMin: number, slotEndMin: number, dateStr: string
): Blackout | null {
  if (!brand) return null
  const dow = new Date(dateStr + 'T00:00:00').getDay()
  for (const b of blackouts) {
    if (b.brand !== brand) continue
    if (b.platform && b.platform !== platform) continue
    if (b.day_of_week && !b.day_of_week.includes(dow)) continue
    const bStart = timeToMin(b.start_time)
    const bEnd = timeToMin(b.end_time)
    if (slotStartMin < bEnd && slotEndMin > bStart) return b
  }
  return null
}

// Derive time range: prefer jamMulai+durasi, fall back to session number (session N = (N-1):00–N:00)
function slotTimeRange(session: number, jamMulai: string, durasi: number): { startMin: number; endMin: number } {
  if (jamMulai && durasi) {
    const s = timeToMin(jamMulai)
    return { startMin: s, endMin: Math.min(s + Math.round(durasi * 60), 1440) }
  }
  return { startMin: (session - 1) * 60, endMin: session * 60 }
}

interface Props {
  profile: { full_name: string; role: string }
  rooms: Room[]
  hosts: Host[]
  brands: string[]
}

const PLATFORM_DOT: Record<string, string> = {
  Shopee: 'bg-orange-400', TikTok: 'bg-pink-400',
  Instagram: 'bg-purple-400', YouTube: 'bg-red-400', Other: 'bg-gray-400',
}
const PLATFORM_SPAN: Record<string, string> = {
  Shopee:    'bg-orange-50 border-l-[3px] border-orange-300',
  TikTok:    'bg-pink-50 border-l-[3px] border-pink-300',
  Instagram: 'bg-purple-50 border-l-[3px] border-purple-300',
  YouTube:   'bg-red-50 border-l-[3px] border-red-300',
  Other:     'bg-gray-50 border-l-[3px] border-gray-300',
  '':        'bg-brand-50/60 border-l-[3px] border-brand-300',
}

function formatWeekRange(dates: Date[]): string {
  if (!dates.length) return ''
  const start = dates[0]
  const end = dates[6]
  const startFmt = start.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })
  const endFmt = end.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${startFmt} – ${endFmt}`
}

const EMPTY_FORM = { hostId: '', brand: '', platform: '', konsep: '', background: '', kostum: '', gimmick: '', jamMulai: '', durasi: 0 }

function calcJamSelesai(jamMulai: string, durasi: number): string {
  if (!jamMulai || !durasi) return ''
  const [h, m] = jamMulai.split(':').map(Number)
  const totalMin = h * 60 + m + Math.round(durasi * 60)
  const eh = Math.floor(totalMin / 60) % 24
  const em = totalMin % 60
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
}

export default function ScheduleClient({ profile, rooms, hosts, brands }: Props) {
  const { lang } = useLang()
  const [baseDate, setBaseDate] = useState(new Date())
  const [weekDates, setWeekDates] = useState<Date[]>(getWeekDates(new Date()))
  const [activeDay, setActiveDay] = useState(0)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)
  const [editSlot, setEditSlot] = useState<{date:string; session:number; roomId:string; existing?:Slot}|null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [dupDays, setDupDays] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showDupConfirm, setShowDupConfirm] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [dupResult, setDupResult] = useState('')
  // Time-group collapse: open only the group covering the current hour by default
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const cur = currentTimeGroup()
    return { morning: cur !== 'morning', afternoon: cur !== 'afternoon', night: cur !== 'night' }
  })
  const [blackouts, setBlackouts] = useState<Blackout[]>([])
  // Drag-and-drop (kanban) state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [moveError, setMoveError] = useState('')
  const isAdmin = profile.role === 'superadmin'

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    const dates = getWeekDates(baseDate)
    setWeekDates(dates)
    const todayStr = toLocalDateStr(new Date())
    const idx = dates.findIndex(d => toLocalDateStr(d) === todayStr)
    setActiveDay(idx >= 0 ? idx : 0)
  }, [baseDate])

  const fetchSlots = useCallback(async () => {
    if (!weekDates.length) return
    setLoading(true)
    const supabase = createClient()
    // Fetch one day before the week to catch midnight-crossing slots from the previous day
    const weekStart = new Date(weekDates[0]); weekStart.setDate(weekStart.getDate() - 1)
    const from = toLocalDateStr(weekStart)
    const to = toLocalDateStr(weekDates[6])
    const [{ data: slotsData }, { data: boData }] = await Promise.all([
      supabase.from('schedule_slots').select('*').gte('slot_date', from).lte('slot_date', to),
      supabase.from('client_blackouts').select('*'),
    ])
    if (slotsData) setSlots(slotsData)
    if (boData) setBlackouts(boData)
    setLoading(false)
  }, [weekDates])

  useEffect(() => { fetchSlots() }, [fetchSlots])

  const activeDate = weekDates[activeDay]
  const activeDateStr = activeDate ? toLocalDateStr(activeDate) : ''

  function getSlot(session: number, roomId: string): Slot | undefined {
    return slots.find(s => s.slot_date === activeDateStr && s.session_no === session && s.room_id === roomId)
  }
  function getHost(hostId?: string) { return hosts.find(h => h.id === hostId) }

  function openEdit(session: number, roomId: string) {
    if (!isAdmin) return
    const existing = getSlot(session, roomId)
    setForm({
      hostId: existing?.host_id || '', brand: existing?.brand || '',
      platform: existing?.platform || '', konsep: existing?.konsep || '',
      background: existing?.background || '', kostum: existing?.kostum || '',
      gimmick: existing?.gimmick || '',
      jamMulai: existing?.jam_mulai || '', durasi: existing?.durasi || 0,
    })
    setDupDays([])
    setSaveError('')
    setEditSlot({ date: activeDateStr, session, roomId, existing })
  }

  function toggleDupDay(dateStr: string) {
    setDupDays(prev => prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr])
  }

  async function saveSlot() {
    if (!editSlot) return
    setSaveError('')

    // Room overlap check — no two bookings may overlap in time in the SAME room on the same day.
    // This is the primary guard against double-booking a room (regardless of host/brand).
    {
      const { startMin, endMin } = slotTimeRange(editSlot.session, form.jamMulai, form.durasi)
      const roomConflict = slots.find(s => {
        if (s.slot_date !== editSlot.date) return false
        if (s.room_id !== editSlot.roomId) return false
        if (!s.host_id && !s.brand) return false // ignore empty placeholder rows
        if (editSlot.existing?.id && s.id === editSlot.existing.id) return false
        const { startMin: sS, endMin: sE } = slotTimeRange(s.session_no, s.jam_mulai || '', s.durasi || 0)
        return startMin < sE && endMin > sS
      })
      if (roomConflict) {
        const cHost = getHost(roomConflict.host_id)?.username || getHost(roomConflict.host_id)?.full_name || roomConflict.brand || 'sesi lain'
        const cStart = roomConflict.jam_mulai ? roomConflict.jam_mulai.slice(0, 5) : SESSION_LABELS[roomConflict.session_no]
        setSaveError(`⛔ Ruangan ini sudah dipakai (${cHost}) pada ${cStart}. Waktu tidak boleh bentrok.`)
        return
      }
    }

    // Duplicate host check — same host can't have overlapping sessions on the same day
    if (form.hostId) {
      const { startMin, endMin } = slotTimeRange(editSlot.session, form.jamMulai, form.durasi)
      const hostConflict = slots.find(s => {
        if (s.slot_date !== editSlot.date) return false
        if (s.host_id !== form.hostId) return false
        if (editSlot.existing?.id && s.id === editSlot.existing.id) return false
        const { startMin: sS, endMin: sE } = slotTimeRange(s.session_no, s.jam_mulai || '', s.durasi || 0)
        return startMin < sE && endMin > sS
      })
      if (hostConflict) {
        const hostName = getHost(form.hostId)?.full_name || ''
        setSaveError(`⚠️ ${hostName} sudah dijadwalkan di sesi ${SESSION_LABELS[hostConflict.session_no]} pada tanggal ini`)
        return
      }
    }

    // Duplicate brand+platform check — same brand AND same platform can't overlap on same day
    // (different platforms of the same brand are fine)
    if (form.brand && form.platform) {
      const { startMin, endMin } = slotTimeRange(editSlot.session, form.jamMulai, form.durasi)
      const bpConflict = slots.find(s => {
        if (s.slot_date !== editSlot.date) return false
        if (s.brand !== form.brand || s.platform !== form.platform) return false
        if (editSlot.existing?.id && s.id === editSlot.existing.id) return false
        const { startMin: sS, endMin: sE } = slotTimeRange(s.session_no, s.jam_mulai || '', s.durasi || 0)
        return startMin < sE && endMin > sS
      })
      if (bpConflict) {
        setSaveError(`⚠️ ${form.brand} (${form.platform}) sudah ada di sesi ${SESSION_LABELS[bpConflict.session_no]} pada tanggal ini`)
        return
      }
    }

    // Blackout check — runs whenever brand is set (uses session time if jamMulai not filled)
    if (form.brand) {
      const { startMin, endMin } = slotTimeRange(editSlot.session, form.jamMulai, form.durasi)
      const conflict = checkBlackoutConflict(blackouts, form.brand, form.platform, startMin, endMin, editSlot.date)
      if (conflict) {
        const fmtT = (t: string) => t.slice(0, 5)
        setSaveError(
          `⛔ ${form.brand} tidak bisa live` +
          (conflict.platform ? ` di ${conflict.platform}` : '') +
          ` jam ${fmtT(conflict.start_time)}–${fmtT(conflict.end_time)}` +
          (conflict.reason ? ` (${conflict.reason})` : '')
        )
        return
      }
    }

    setSaving(true)
    const supabase = createClient()

    const payload = {
      slot_date: editSlot.date, session_no: editSlot.session, room_id: editSlot.roomId,
      host_id: form.hostId || null, brand: form.brand || null,
      platform: form.platform || null, konsep: form.konsep || null,
      background: form.background || null, kostum: form.kostum || null,
      gimmick: form.gimmick || null, status: 'scheduled',
      jam_mulai: form.jamMulai || null, durasi: form.durasi || null,
    }

    let error
    if (editSlot.existing?.id) {
      ;({ error } = await supabase.from('schedule_slots').update(payload).eq('id', editSlot.existing.id))
    } else {
      ;({ error } = await supabase.from('schedule_slots').insert(payload))
    }
    if (error) { setSaveError(error.message); setSaving(false); return }

    // Duplicate to selected days within the week
    if (dupDays.length > 0) {
      const dups = dupDays.map(date => ({ ...payload, slot_date: date, id: undefined }))
      await supabase.from('schedule_slots')
        .upsert(dups.map(({ id: _, ...rest }) => rest), { onConflict: 'slot_date,session_no,room_id', ignoreDuplicates: false })
    }

    setSaving(false)
    setEditSlot(null)
    fetchSlots()
  }

  async function deleteSlot() {
    if (!editSlot?.existing?.id) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('schedule_slots').delete().eq('id', editSlot.existing.id)
    setSaving(false); setEditSlot(null); fetchSlots()
  }

  // Kanban move — drag a slot card onto another (session, room) cell on the active day.
  async function moveSlot(slotId: string, targetSession: number, targetRoomId: string) {
    setMoveError('')
    const slot = slots.find(s => s.id === slotId)
    if (!slot) return
    // No-op if dropped on its own origin
    if (slot.session_no === targetSession && slot.room_id === targetRoomId) return

    const durasi = slot.durasi || 0
    // Snap to the target session's hour; keep explicit jam_mulai semantics only if it had one
    const pad = (n: number) => String(n).padStart(2, '0')
    const newJam = slot.jam_mulai ? `${pad(targetSession - 1)}:00` : null
    const { startMin, endMin } = slotTimeRange(targetSession, newJam || '', durasi)

    // Room overlap check at destination
    const conflict = slots.find(s => {
      if (s.id === slotId) return false
      if (s.slot_date !== slot.slot_date) return false
      if (s.room_id !== targetRoomId) return false
      if (!s.host_id && !s.brand) return false
      const { startMin: sS, endMin: sE } = slotTimeRange(s.session_no, s.jam_mulai || '', s.durasi || 0)
      return startMin < sE && endMin > sS
    })
    if (conflict) {
      const cName = getHost(conflict.host_id)?.username || getHost(conflict.host_id)?.full_name || conflict.brand || 'sesi lain'
      setMoveError(`⛔ Tidak bisa pindah — bentrok dengan ${cName} di ruangan tujuan`)
      setTimeout(() => setMoveError(''), 4000)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.from('schedule_slots')
      .update({ session_no: targetSession, room_id: targetRoomId, jam_mulai: newJam })
      .eq('id', slotId)
    if (error) {
      setMoveError('Gagal memindahkan: ' + error.message)
      setTimeout(() => setMoveError(''), 4000)
      return
    }
    fetchSlots()
  }

  function handleDropOnCell(session: number, roomId: string) {
    setDragOverKey(null)
    const id = draggingId
    setDraggingId(null)
    if (id) moveSlot(id, session, roomId)
  }

  async function duplicateWeek() {
    setDuplicating(true)
    const supabase = createClient()
    const from = toLocalDateStr(weekDates[0])
    const to = toLocalDateStr(weekDates[6])
    const { data: thisWeekSlots } = await supabase
      .from('schedule_slots').select('*')
      .gte('slot_date', from).lte('slot_date', to).not('host_id', 'is', null)

    if (!thisWeekSlots?.length) {
      setDupResult('Tidak ada jadwal minggu ini untuk diduplikasi.')
      setDuplicating(false); setShowDupConfirm(false); return
    }

    const nextWeekSlots = thisWeekSlots.map(s => {
      const d = new Date(s.slot_date); d.setDate(d.getDate() + 7)
      return {
        slot_date: toLocalDateStr(d), session_no: s.session_no, room_id: s.room_id,
        host_id: s.host_id, brand: s.brand, platform: s.platform,
        konsep: s.konsep, background: s.background, kostum: s.kostum, gimmick: s.gimmick,
        jam_mulai: s.jam_mulai, durasi: s.durasi,
        status: 'scheduled',
      }
    })

    const { error } = await supabase.from('schedule_slots')
      .upsert(nextWeekSlots, { onConflict: 'slot_date,session_no,room_id', ignoreDuplicates: true })

    setDuplicating(false); setShowDupConfirm(false)
    if (error) { setDupResult('Error: ' + error.message) } else {
      setDupResult(`✓ ${nextWeekSlots.length} sesi berhasil diduplikasi ke minggu depan!`)
      const next = new Date(baseDate); next.setDate(next.getDate() + 7); setBaseDate(next)
    }
  }

  // Build map of sessions blocked by spanning slots — includes midnight crossings from previous day.
  // Value carries `fromPrevDay` so the grid can label cells that are blocked by yesterday's live.
  const coveredBySlot = useMemo(() => {
    const map = new Map<string, { slot: Slot; fromPrevDay: boolean }>()

    // Real (uncapped) end minute of a slot — uses jam_mulai when set, else session number.
    const realEndMin = (s: Slot) => {
      const startMin = s.jam_mulai ? timeToMin(s.jam_mulai) : (s.session_no - 1) * 60
      const durMin = (s.durasi || 1) * 60
      return startMin + durMin
    }

    // Same-day continuation cells (sessions 2..24 of today)
    slots.filter(s => s.slot_date === activeDateStr && (s.durasi || 0) > 1).forEach(slot => {
      const endMin = realEndMin(slot)
      // Block every later session whose start falls before this slot's end (capped at midnight)
      for (let sess = slot.session_no + 1; sess <= 24; sess++) {
        if ((sess - 1) * 60 < endMin) map.set(`${sess}_${slot.room_id}`, { slot, fromPrevDay: false })
        else break
      }
    })

    // Previous-day slots that cross midnight into today
    if (activeDate) {
      const prev = new Date(activeDate); prev.setDate(prev.getDate() - 1)
      const prevStr = toLocalDateStr(prev)
      slots.filter(s => s.slot_date === prevStr && (s.durasi || 0) >= 1).forEach(slot => {
        const overflowMin = realEndMin(slot) - 1440  // minutes past midnight into today
        if (overflowMin <= 0) return
        const sessionsCrossed = Math.ceil(overflowMin / 60)  // today's sessions 1..N
        for (let todaySess = 1; todaySess <= Math.min(sessionsCrossed, 24); todaySess++) {
          map.set(`${todaySess}_${slot.room_id}`, { slot, fromPrevDay: true })
        }
      })
    }

    return map
  }, [slots, activeDateStr, activeDate])

  const dayLabels = lang === 'id' ? DAYS_ID : DAYS_EN
  const groups = Array.from(new Set(rooms.map(r => r.group_name)))
  const dayCounts = weekDates.map(d => {
    const ds = toLocalDateStr(d)
    return slots.filter(s => s.slot_date === ds && s.host_id).length
  })
  const totalThisWeek = slots.filter(s => s.host_id).length

  // Other days of the week (excluding the active/current edit day)
  const otherDays = weekDates.filter(d => toLocalDateStr(d) !== (editSlot?.date || activeDateStr))

  const roomsWidth = rooms.length * 150

  function renderSessionRow(session: number) {
    const rowHasData = rooms.some(r => !!getSlot(session, r.id)?.host_id || coveredBySlot.has(`${session}_${r.id}`))
    return (
      <div key={session} className={cn('flex border-b border-gray-100', rowHasData ? 'bg-white' : 'bg-gray-50/50')}
        style={{ minHeight: '36px' }}>
        <div className="w-20 flex-shrink-0 px-2 border-r border-gray-100 flex items-center gap-1">
          <span className="text-[9px] text-gray-300 font-mono w-3">{session}</span>
          <span className="text-[10px] font-mono text-gray-500">{SESSION_LABELS[session]}</span>
        </div>
        {rooms.map(room => {
          const covering = coveredBySlot.get(`${session}_${room.id}`)
          if (covering) {
            const { slot: coveringSlot, fromPrevDay } = covering
            const coveringHost = getHost(coveringSlot.host_id)
            // Continuation cell — blocked by a spanning slot (today's earlier session, or yesterday crossing midnight)
            return (
              <div key={room.id}
                onClick={() => isAdmin && !fromPrevDay && openEdit(coveringSlot.session_no, room.id)}
                className={cn('border-r border-gray-100 last:border-r-0 px-1.5 flex items-center transition-colors',
                  isAdmin && !fromPrevDay ? 'cursor-pointer hover:opacity-70' : 'cursor-default',
                  PLATFORM_SPAN[coveringSlot.platform || ''] || PLATFORM_SPAN['']
                )}
                style={{ width: '150px', minHeight: '36px' }}
              >
                {fromPrevDay && (
                  <div className="min-w-0 leading-tight">
                    <p className="text-[9px] font-semibold text-gray-500 truncate">
                      ↳ {coveringHost?.username || coveringHost?.full_name || 'Live'} (kemarin)
                    </p>
                    <p className="text-[8px] text-gray-400 truncate">
                      {coveringSlot.brand}{coveringSlot.jam_mulai ? ` · mulai ${coveringSlot.jam_mulai}` : ''}
                    </p>
                  </div>
                )}
              </div>
            )
          }

          const slot = getSlot(session, room.id)
          const host = getHost(slot?.host_id)
          const cellKey = `${session}_${room.id}`
          const isDragOver = dragOverKey === cellKey
          const isDragging = !!slot?.id && draggingId === slot.id
          const draggable = isAdmin && !!slot?.host_id
          return (
            <div key={room.id}
              draggable={draggable}
              onDragStart={draggable ? (e => { e.dataTransfer.effectAllowed = 'move'; if (slot?.id) setDraggingId(slot.id) }) : undefined}
              onDragEnd={() => { setDraggingId(null); setDragOverKey(null) }}
              onDragOver={e => { if (draggingId && draggingId !== slot?.id) { e.preventDefault(); setDragOverKey(cellKey) } }}
              onDragLeave={() => setDragOverKey(k => k === cellKey ? null : k)}
              onDrop={e => { e.preventDefault(); handleDropOnCell(session, room.id) }}
              onClick={() => { if (!draggingId) openEdit(session, room.id) }}
              className={cn('border-r border-gray-100 last:border-r-0 px-1.5 py-0.5 flex items-center transition-colors',
                isAdmin ? 'cursor-pointer hover:bg-brand-50/60' : 'cursor-default',
                draggable ? 'active:cursor-grabbing' : '',
                isDragging ? 'opacity-30' : '',
                isDragOver ? 'ring-2 ring-inset ring-brand-500 bg-brand-50' : '',
                slot?.host_id ? (slot.status === 'live' ? 'bg-green-50' : slot.status === 'done' ? 'bg-gray-50' : 'bg-brand-50/40') : '',
                slot?.host_id && (slot.durasi || 0) > 1 ? (PLATFORM_SPAN[slot.platform || ''] || PLATFORM_SPAN['']).split(' ')[1] + ' ' + (PLATFORM_SPAN[slot.platform || ''] || PLATFORM_SPAN['']).split(' ')[2] : '',
              )}
              style={{ width: '150px', minHeight: '36px' }}>
              {slot?.host_id ? (
                <div className="w-full">
                  <div className="flex items-center gap-1 min-w-0">
                    {slot.platform && (
                      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', PLATFORM_DOT[slot.platform] || 'bg-gray-400')}/>
                    )}
                    <span className="text-[11px] font-semibold text-gray-900 truncate leading-tight">
                      {host?.username || host?.full_name || '?'}
                    </span>
                  </div>
                  {slot.brand && (
                    <p className="text-[9px] font-semibold text-gray-600 truncate leading-tight mt-0.5">
                      {slot.brand}{slot.platform ? ` · ${slot.platform}` : ''}
                    </p>
                  )}
                  {(slot.konsep || slot.background || slot.kostum || slot.gimmick) && (
                    <p className="text-[8px] text-gray-400 truncate leading-tight mt-0.5">
                      {[slot.konsep, slot.background, slot.kostum, slot.gimmick].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              ) : isAdmin ? (
                <div className="w-full flex items-center justify-center h-full opacity-20 hover:opacity-60">
                  <Plus size={11} className="text-gray-400"/>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="flex flex-col" style={{ height: '100vh' }}>

        {/* Drag move error toast */}
        {moveError && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg">
            {moveError}
          </div>
        )}

        {/* Top bar */}
        <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center gap-2 flex-shrink-0 flex-wrap">
          <h1 className="font-bold text-gray-900 text-sm">{tr('schedule', lang)}</h1>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{totalThisWeek} sesi</span>
          {isAdmin && (
            <span className="text-[10px] text-gray-400 hidden sm:inline">· seret kartu untuk pindah jam/ruangan</span>
          )}
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => setBaseDate(new Date())}
              className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1.5 rounded-lg font-medium hover:bg-brand-100">
              Hari Ini
            </button>
            {isAdmin && (
              <button onClick={() => setShowDupConfirm(true)}
                className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-lg font-medium hover:bg-emerald-100">
                <Copy size={12}/> Duplikasi Minggu
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-1.5 py-1">
            <button onClick={() => { const d=new Date(baseDate); d.setDate(d.getDate()-7); setBaseDate(d) }}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-500"><ChevronLeft size={14}/></button>
            <span className="text-xs font-semibold text-gray-700 px-2 min-w-[180px] text-center">
              {formatWeekRange(weekDates)}
            </span>
            <button onClick={() => { const d=new Date(baseDate); d.setDate(d.getDate()+7); setBaseDate(d) }}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-500"><ChevronRight size={14}/></button>
          </div>
        </div>

        {/* Day tabs */}
        <div className="bg-white border-b border-gray-200 px-4 flex gap-0 flex-shrink-0">
          {weekDates.map((date, i) => {
            const isToday = toLocalDateStr(date) === toLocalDateStr(new Date())
            const active = activeDay === i
            return (
              <button key={i} onClick={() => setActiveDay(i)}
                className={cn('relative flex flex-col items-center px-4 py-2.5 border-b-2 transition-all min-w-[70px]',
                  active ? 'border-brand-600 bg-white' : 'border-transparent hover:bg-gray-50')}>
                <span className={cn('text-[10px] uppercase tracking-wider font-semibold',
                  active ? 'text-brand-600' : 'text-gray-400')}>{dayLabels[i]}</span>
                <span className={cn('text-lg font-bold mt-0.5 leading-none',
                  isToday ? 'text-brand-600' : active ? 'text-gray-900' : 'text-gray-500')}>
                  {date.getDate()}
                </span>
                {dayCounts[i] > 0 && (
                  <span className={cn('text-[9px] rounded-full px-1.5 mt-0.5 font-medium',
                    active ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-600')}>
                    {dayCounts[i]}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">Memuat...</div>
          ) : (
            <div className="min-w-max h-full flex flex-col">
              {/* Column headers */}
              <div className="sticky top-0 z-20 bg-white border-b border-gray-200 flex shadow-sm flex-shrink-0">
                <div className="w-20 flex-shrink-0 px-2 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-r border-gray-100 flex items-end pb-2">Sesi</div>
                {groups.map(group => {
                  const gr = rooms.filter(r => r.group_name === group)
                  return (
                    <div key={group} className="flex flex-col border-r border-gray-200">
                      <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white bg-brand-600 text-center"
                        style={{ minWidth: `${gr.length * 150}px` }}>{group}</div>
                      <div className="flex">
                        {gr.map(room => (
                          <div key={room.id} className="px-2 py-1.5 text-xs font-bold text-gray-700 border-r border-gray-100 last:border-r-0 text-center bg-gray-50"
                            style={{ width: '150px' }}>{room.name}</div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Session rows — grouped by time of day, collapsible */}
              {TIME_GROUPS.map(group => {
                const isCollapsed = collapsedGroups[group.key]
                const count = slots.filter(s =>
                  s.slot_date === activeDateStr && (group.sessions as readonly number[]).includes(s.session_no) && s.host_id).length
                return (
                  <div key={group.key}>
                    {/* Group header — click to expand/collapse */}
                    <div onClick={() => toggleGroup(group.key)}
                      className="flex border-b border-pink-200 cursor-pointer select-none">
                      <div className={cn('w-20 flex-shrink-0 flex items-center justify-center border-r border-pink-100 border-l-4 transition-colors',
                        isCollapsed ? 'bg-pink-50 border-l-pink-200' : 'bg-pink-100 border-l-pink-500')}>
                        {isCollapsed
                          ? <ChevronRight size={15} className="text-pink-400"/>
                          : <ChevronDown size={15} className="text-pink-600"/>}
                      </div>
                      <div style={{ width: `${roomsWidth}px` }}
                        className={cn('flex items-center gap-2 px-3 py-2 transition-colors',
                          isCollapsed ? 'bg-pink-50' : 'bg-pink-100')}>
                        <span className="text-xs font-bold text-pink-700 uppercase tracking-wide">{group.label}</span>
                        <span className="text-[10px] text-pink-400 font-mono">{group.sub}</span>
                        {count > 0 && (
                          <span className="text-[9px] bg-pink-500 text-white px-1.5 py-0.5 rounded-full font-semibold">{count} sesi</span>
                        )}
                        <span className="ml-auto text-[10px] text-pink-400 font-medium">
                          {isCollapsed ? 'Tampilkan' : 'Sembunyikan'}
                        </span>
                      </div>
                    </div>
                    {!isCollapsed && group.sessions.map(session => renderSessionRow(session))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editSlot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto"
          onClick={() => setEditSlot(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">{rooms.find(r => r.id === editSlot.roomId)?.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{SESSION_LABELS[editSlot.session]} · {editSlot.date}</p>
              </div>
              <button onClick={() => setEditSlot(null)} className="p-1 rounded-lg hover:bg-gray-100"><X size={16} className="text-gray-400"/></button>
            </div>

            <form autoComplete="off" onSubmit={e => e.preventDefault()} className="p-5 space-y-3">
              {/* Host */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{tr('host', lang)}</label>
                <select value={form.hostId} onChange={e => setForm(f => ({...f, hostId: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50">
                  <option value="">— Tidak ada —</option>
                  {hosts.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
                </select>
              </div>

              {/* Brand */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Brand</label>
                {brands.length > 0 ? (
                  <select value={form.brand} onChange={e => setForm(f => ({...f, brand: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50">
                    <option value="">— Pilih brand —</option>
                    {brands.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                ) : (
                  <div className="border border-dashed border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-400 bg-gray-50">
                    Belum ada brand — tambah Client di Onboarding
                  </div>
                )}
              </div>

              {/* Platform */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Platform</label>
                <select value={form.platform} onChange={e => setForm(f => ({...f, platform: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50">
                  <option value="">—</option>
                  {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>

              {/* Jam Mulai + Durasi */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Live Durasi</label>
                <div className="flex items-center gap-2">
                  {/* Start time */}
                  <TimeInput
                    value={form.jamMulai}
                    onChange={v => setForm(f => ({ ...f, jamMulai: v }))}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50"
                  />
                  <span className="text-gray-400 text-sm font-medium flex-shrink-0">+</span>
                  {/* Duration stepper */}
                  <div className="flex items-center gap-1 border border-gray-200 rounded-xl bg-gray-50 px-1">
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, durasi: Math.max(0, +(f.durasi - 0.5).toFixed(1)) }))}
                      className="w-7 h-8 flex items-center justify-center text-gray-500 hover:text-brand-700 text-base font-bold">−</button>
                    <span className="text-sm font-bold text-gray-800 min-w-[36px] text-center">
                      {form.durasi > 0 ? `${form.durasi}j` : '—'}
                    </span>
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, durasi: Math.min(12, +(f.durasi + 0.5).toFixed(1)) }))}
                      className="w-7 h-8 flex items-center justify-center text-gray-500 hover:text-brand-700 text-base font-bold">+</button>
                  </div>
                </div>
                {/* Quick presets */}
                <div className="flex gap-1.5 mt-2">
                  {[1, 2, 3, 4, 5, 6].map(h => (
                    <button key={h} type="button"
                      onClick={() => setForm(f => ({ ...f, durasi: h }))}
                      className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors',
                        form.durasi === h
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-brand-400 hover:text-brand-700')}>
                      {h}j
                    </button>
                  ))}
                </div>
                {/* Auto end time preview */}
                {form.jamMulai && form.durasi > 0 && (
                  <div className="mt-2 flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-xl px-3 py-2">
                    <span className="text-xs text-brand-500 font-medium">Waktu Live:</span>
                    <span className="text-sm font-bold text-brand-700">
                      {form.jamMulai} – {calcJamSelesai(form.jamMulai, form.durasi)}
                    </span>
                  </div>
                )}
                {/* Live blackout warning — shows as soon as brand conflicts with session time */}
                {editSlot && form.brand && (() => {
                  const { startMin, endMin } = slotTimeRange(editSlot.session, form.jamMulai, form.durasi)
                  const c = checkBlackoutConflict(blackouts, form.brand, form.platform, startMin, endMin, editSlot.date)
                  if (!c) return null
                  return (
                    <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                      <span className="text-base leading-none mt-0.5">⛔</span>
                      <div>
                        <p className="text-xs font-bold text-red-700">{form.brand} diblokir jam ini</p>
                        <p className="text-[11px] text-red-500 mt-0.5">
                          {c.platform || 'Semua platform'} · {c.start_time.slice(0,5)}–{c.end_time.slice(0,5)}
                          {c.reason ? ` · ${c.reason}` : ''}
                        </p>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Konsep Live */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Konsep Live</label>
                <input value={form.konsep} onChange={e => setForm(f => ({...f, konsep: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50"
                  placeholder="e.g. Flash sale kompor"/>
              </div>

              {/* Background */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Background</label>
                <input value={form.background} onChange={e => setForm(f => ({...f, background: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50"
                  placeholder="e.g. Dapur minimalis putih"/>
              </div>

              {/* Kostum */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Kostum</label>
                <input value={form.kostum} onChange={e => setForm(f => ({...f, kostum: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50"
                  placeholder="e.g. Apron hitam"/>
              </div>

              {/* Gimmick */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Gimmick</label>
                <input value={form.gimmick} onChange={e => setForm(f => ({...f, gimmick: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50"
                  placeholder="e.g. Spin wheel hadiah"/>
              </div>

              {/* Duplicate to other days in this week */}
              <div className="pt-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  Duplikasi ke hari lain minggu ini
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {otherDays.map((d, i) => {
                    const ds = toLocalDateStr(d)
                    const checked = dupDays.includes(ds)
                    const dayName = DAYS_ID[weekDates.indexOf(d)]
                    const dayNum = d.getDate()
                    return (
                      <button key={ds} type="button" onClick={() => toggleDupDay(ds)}
                        className={cn('px-2 py-2 rounded-xl text-xs font-medium border transition-colors text-left',
                          checked
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-brand-400 hover:bg-brand-50')}>
                        <span className="block text-[10px] opacity-70">{dayName}</span>
                        <span className="block font-bold">{d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                      </button>
                    )
                  })}
                </div>
                {dupDays.length > 0 && (
                  <p className="text-xs text-brand-600 mt-1.5 font-medium">
                    + Akan diduplikasi ke {dupDays.length} hari lain
                  </p>
                )}
              </div>

              {saveError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{saveError}</p>}
            </form>

            <div className="px-5 pb-5 flex gap-2">
              {editSlot.existing?.id && (
                <button onClick={deleteSlot} disabled={saving}
                  className="px-3 py-2.5 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 flex items-center gap-1.5">
                  <Trash2 size={13}/> Hapus
                </button>
              )}
              <button onClick={() => setEditSlot(null)}
                className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
                Batal
              </button>
              <button onClick={saveSlot} disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm bg-brand-600 text-white rounded-xl hover:bg-brand-700 flex items-center justify-center gap-2 disabled:opacity-60 font-semibold">
                <Save size={14}/>{saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Week Confirmation */}
      {showDupConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4"
          onClick={() => !duplicating && setShowDupConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Copy size={20} className="text-emerald-600"/>
            </div>
            <h3 className="font-bold text-gray-900 text-base mb-1">Duplikasi Minggu?</h3>
            <p className="text-sm text-gray-500 mb-1">Apakah mau diduplikasi ke minggu depan?</p>
            <p className="text-xs text-gray-400 mb-5">
              {formatWeekRange(weekDates)} → {formatWeekRange(getWeekDates(new Date(baseDate.getTime() + 7*24*60*60*1000)))}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDupConfirm(false)} disabled={duplicating}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Tidak
              </button>
              <button onClick={duplicateWeek} disabled={duplicating}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
                {duplicating ? 'Menduplikasi...' : 'Ya, Duplikasi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dup result toast */}
      {dupResult && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-gray-900 text-white text-sm px-5 py-3 rounded-xl shadow-xl flex items-center gap-3">
            <span>{dupResult}</span>
            <button onClick={() => setDupResult('')} className="text-gray-400 hover:text-white"><X size={14}/></button>
          </div>
        </div>
      )}
    </AppShell>
  )
}
