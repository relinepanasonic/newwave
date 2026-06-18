'use client'
import { useState } from 'react'
import AppShell from '@/components/AppShell'
import { SESSION_LABELS, PLATFORM_COLORS, STATUS_COLORS } from '@/lib/utils'
import { tr, type Lang } from '@/lib/i18n'

interface Slot {
  id: string; slot_date: string; session_no: number
  brand?: string; platform?: string; konsep?: string; status: string
  rooms: { name: string; group_name: string }
  profiles?: { full_name: string }
}
interface Props {
  profile: { full_name: string; role: string; client_brand?: string }
  slots: Slot[]
  weekStart: string
}

const DAYS_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

export default function ClientScheduleClient({ profile, slots, weekStart }: Props) {
  const [lang] = useState<Lang>('id')
  const ws = new Date(weekStart)
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws); d.setDate(ws.getDate() + i); return d
  })

  const grouped = weekDates.map((date, i) => {
    const dateStr = date.toISOString().split('T')[0]
    const daySlots = slots.filter(s => s.slot_date === dateStr)
    return { date, dayLabel: DAYS_ID[i], dateStr, slots: daySlots }
  }).filter(d => d.slots.length > 0)

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{tr('clientschedule', lang)}</h1>
          {profile.client_brand && (
            <p className="text-sm text-gray-500 mt-0.5">Brand: <span className="font-semibold text-brand-700">{profile.client_brand}</span></p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            {ws.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} —{' '}
            {weekDates[6].toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {grouped.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <p className="text-gray-400 text-sm">
              {lang === 'id' ? 'Tidak ada jadwal live minggu ini' : 'No live schedule this week'}
            </p>
          </div>
        ) : grouped.map(({ date, dayLabel, slots: daySlots }) => (
          <div key={dayLabel} className="mb-5">
            <h2 className="text-sm font-bold text-gray-700 mb-2">
              {dayLabel}, {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}
            </h2>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {daySlots.map(slot => (
                <div key={slot.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="font-mono text-xs text-gray-500 w-16 flex-shrink-0">{SESSION_LABELS[slot.session_no]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{slot.rooms?.name}</p>
                    <p className="text-xs text-gray-500">{slot.profiles?.full_name} {slot.konsep && `· ${slot.konsep}`}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {slot.platform && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[slot.platform] || PLATFORM_COLORS.Other}`}>
                        {slot.platform}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[slot.status]}`}>
                      {tr(slot.status, lang)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  )
}
