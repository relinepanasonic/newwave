'use client'
import { useState } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { SESSION_LABELS, PLATFORM_COLORS, cn } from '@/lib/utils'
import { LogIn, LogOut, Clock, CheckCircle } from 'lucide-react'
import { tr, type Lang } from '@/lib/i18n'

interface CheckIn { id: string; clock_in: string | null; clock_out: string | null; total_hours: number | null }
interface Slot {
  id: string; session_no: number; brand?: string; platform?: string; konsep?: string; status: string
  rooms: { name: string; group_name: string }
  check_ins: CheckIn[]
}

interface Props {
  profile: { full_name: string; role: string; id: string }
  slots: Slot[]
  today: string
}

function formatTime(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function CheckinClient({ profile, slots, today }: Props) {
  const [lang] = useState<Lang>('id')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [localSlots, setLocalSlots] = useState<Slot[]>(slots)

  const todayLabel = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  async function clockIn(slotId: string) {
    setLoadingId(slotId)
    const supabase = createClient()
    const { data } = await supabase.from('check_ins').insert({
      slot_id: slotId,
      host_id: profile.id,
      clock_in: new Date().toISOString(),
    }).select().single()
    if (data) {
      setLocalSlots(prev => prev.map(s => s.id === slotId ? { ...s, check_ins: [data] } : s))
    }
    setLoadingId(null)
  }

  async function clockOut(slotId: string, checkInId: string) {
    setLoadingId(slotId)
    const supabase = createClient()
    const { data } = await supabase.from('check_ins')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', checkInId).select().single()
    if (data) {
      setLocalSlots(prev => prev.map(s =>
        s.id === slotId ? { ...s, check_ins: [data] } : s
      ))
    }
    setLoadingId(null)
  }

  const scheduledSlots = localSlots.filter(s => s.status !== 'cancelled')
  const totalHoursToday = scheduledSlots.reduce((sum, s) => {
    const ci = s.check_ins?.[0]
    return sum + (ci?.total_hours || 0)
  }, 0)

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{tr('checkin', lang)}</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">{todayLabel}</p>
        </div>

        {/* Summary chips */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 flex items-center gap-2">
            <Clock size={16} className="text-brand-600" />
            <div>
              <p className="text-xs text-brand-500 font-medium">{tr('totalHours', lang)} Hari Ini</p>
              <p className="text-lg font-bold text-brand-700">{totalHoursToday.toFixed(1)} jam</p>
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-600" />
            <div>
              <p className="text-xs text-emerald-500 font-medium">Sesi Hari Ini</p>
              <p className="text-lg font-bold text-emerald-700">{scheduledSlots.length} sesi</p>
            </div>
          </div>
        </div>

        {/* Slots */}
        {scheduledSlots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <p className="text-gray-400 text-sm">{tr('noSchedule', lang)}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scheduledSlots.map(slot => {
              const ci = slot.check_ins?.[0]
              const hasClockedIn = !!ci?.clock_in
              const hasClockedOut = !!ci?.clock_out
              const isLoading = loadingId === slot.id

              return (
                <div key={slot.id} className={cn(
                  'bg-white rounded-2xl border shadow-sm p-4 transition-all',
                  hasClockedOut ? 'border-emerald-200 bg-emerald-50/30' :
                  hasClockedIn ? 'border-brand-200 bg-brand-50/30' : 'border-gray-100'
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
                          {SESSION_LABELS[slot.session_no]}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">{slot.rooms?.name}</span>
                        {slot.platform && (
                          <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', PLATFORM_COLORS[slot.platform] || PLATFORM_COLORS.Other)}>
                            {slot.platform}
                          </span>
                        )}
                      </div>
                      {slot.brand && <p className="text-xs text-gray-500 mt-1">{slot.brand}</p>}
                      {slot.konsep && <p className="text-xs text-gray-400">{slot.konsep}</p>}

                      {/* Time info */}
                      {hasClockedIn && (
                        <div className="mt-2 flex items-center gap-4 text-xs text-gray-600">
                          <span className="flex items-center gap-1">
                            <LogIn size={11} className="text-brand-500"/>
                            {formatTime(ci!.clock_in)}
                          </span>
                          {hasClockedOut && (
                            <>
                              <span className="flex items-center gap-1">
                                <LogOut size={11} className="text-emerald-500"/>
                                {formatTime(ci!.clock_out)}
                              </span>
                              <span className="font-semibold text-emerald-600">
                                {ci!.total_hours?.toFixed(2)} jam
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    <div className="flex-shrink-0">
                      {!hasClockedIn && (
                        <button
                          onClick={() => clockIn(slot.id)}
                          disabled={isLoading}
                          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
                        >
                          <LogIn size={14}/>
                          {isLoading ? '...' : tr('clockIn', lang)}
                        </button>
                      )}
                      {hasClockedIn && !hasClockedOut && (
                        <button
                          onClick={() => clockOut(slot.id, ci!.id)}
                          disabled={isLoading}
                          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
                        >
                          <LogOut size={14}/>
                          {isLoading ? '...' : tr('clockOut', lang)}
                        </button>
                      )}
                      {hasClockedOut && (
                        <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                          <CheckCircle size={16}/>
                          {lang === 'id' ? 'Selesai' : 'Done'}
                        </div>
                      )}
                    </div>
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
