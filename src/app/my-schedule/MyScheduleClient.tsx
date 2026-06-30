'use client'
import { useState } from 'react'
import AppShell from '@/components/AppShell'
import { PLATFORM_COLORS, getPayPeriod } from '@/lib/utils'
import { tr } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'
import { CalendarDays, Clock, CalendarCheck, Copy, ExternalLink, Check } from 'lucide-react'

interface CheckIn { total_hours: number | null }
interface Slot {
  id: string; slot_date: string; session_no: number
  brand?: string; platform?: string; konsep?: string; status: string
  background?: string; kostum?: string; gimmick?: string
  jam_mulai?: string; durasi?: number
  rooms: { name: string }
  check_ins: CheckIn[]
}

const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

// Real time range: "17:00 – 21:00" using jam_mulai + durasi; falls back to session label.
function slotTimeLabel(slot: Slot): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  let startMin: number
  if (slot.jam_mulai) {
    const [h, m] = slot.jam_mulai.split(':').map(Number)
    startMin = h * 60 + (m || 0)
  } else {
    startMin = (slot.session_no - 1) * 60
  }
  const durMin = (slot.durasi && slot.durasi > 0 ? slot.durasi : 1) * 60
  const endMin = startMin + durMin
  const fmt = (mins: number) => `${pad(Math.floor((mins % 1440) / 60))}:${pad(mins % 60)}`
  return `${fmt(startMin)} – ${fmt(endMin)}`
}

export default function MyScheduleClient({ profile, slots }: { profile: any; slots: Slot[] }) {
  const { lang } = useLang()
  const payPeriod = getPayPeriod()
  const [copied, setCopied] = useState(false)

  const calFeedUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/calendar/${profile.id}`
    : `/api/calendar/${profile.id}`

  function copyFeedUrl() {
    navigator.clipboard.writeText(calFeedUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  // Google Calendar "add by URL" deep link
  const gcalSubscribeUrl = `https://calendar.google.com/calendar/r/settings/addbyurl?url=${encodeURIComponent(calFeedUrl)}`

  const totalHours = slots.reduce((s, slot) => {
    return s + (slot.check_ins?.[0]?.total_hours || 0)
  }, 0)

  // Group by date
  const byDate: Record<string, Slot[]> = {}
  slots.forEach(s => {
    if (!byDate[s.slot_date]) byDate[s.slot_date] = []
    byDate[s.slot_date].push(s)
  })

  const today = new Date().toISOString().split('T')[0]

  return (
    <AppShell role={profile.role} userName={profile.full_name}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{tr('myschedule', lang)}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tr('payPeriod', lang)}: {payPeriod.label}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 flex items-center gap-3">
            <CalendarDays size={20} className="text-brand-600"/>
            <div>
              <p className="text-xs text-brand-500 font-medium">Total Sesi Bulan Ini</p>
              <p className="text-2xl font-bold text-brand-700">{slots.length}</p>
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
            <Clock size={20} className="text-emerald-600"/>
            <div>
              <p className="text-xs text-emerald-500 font-medium">Total Jam Tercatat</p>
              <p className="text-2xl font-bold text-emerald-700">{totalHours.toFixed(1)}</p>
            </div>
          </div>
        </div>

        {/* Google Calendar Connect Banner */}
        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-3 border-b border-blue-100">
            <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
              <CalendarCheck size={16} className="text-blue-500"/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-blue-900">Sinkronisasi Google Calendar</p>
              <p className="text-xs text-blue-500">Jadwalmu otomatis muncul di Google Calendar + alarm pengingat</p>
            </div>
          </div>
          <div className="px-4 py-3 space-y-3">
            {/* Feed URL */}
            <div>
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1.5">URL Kalender Kamu</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] bg-white border border-blue-100 text-blue-700 px-3 py-2 rounded-xl truncate font-mono">
                  {calFeedUrl}
                </code>
                <button onClick={copyFeedUrl}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex-shrink-0 ${
                    copied ? 'bg-emerald-500 text-white' : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-100'
                  }`}>
                  {copied ? <><Check size={12}/> Tersalin</> : <><Copy size={12}/> Salin</>}
                </button>
              </div>
            </div>
            {/* Quick subscribe button */}
            <a href={gcalSubscribeUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-blue-200 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-100 transition-colors">
              <ExternalLink size={14}/>
              Buka Google Calendar & Subscribe Otomatis
            </a>
            {/* Manual steps */}
            <details className="group">
              <summary className="text-[11px] text-blue-400 cursor-pointer hover:text-blue-600 list-none flex items-center gap-1 select-none">
                <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                Cara manual (jika tombol di atas tidak langsung terbuka)
              </summary>
              <ol className="mt-2 space-y-1 text-[11px] text-blue-600 pl-4 list-decimal">
                <li>Buka <strong>Google Calendar</strong> di browser</li>
                <li>Klik ⚙️ <strong>Pengaturan</strong> → <strong>Tambahkan kalender</strong></li>
                <li>Pilih <strong>"Dari URL"</strong></li>
                <li>Tempel URL di atas → klik <strong>Tambahkan Kalender</strong></li>
                <li>Selesai! Jadwal dan alarm akan otomatis tersinkronisasi</li>
              </ol>
              <p className="mt-2 text-[10px] text-blue-400 pl-4">
                · Alarm: 1 hari sebelum + 1 jam sebelum live<br/>
                · Google Calendar sinkron setiap ±8 jam secara otomatis
              </p>
            </details>
          </div>
        </div>

        {Object.keys(byDate).length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
            Belum ada jadwal bulan ini
          </div>
        ) : Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, daySlots]) => {
          const d = new Date(date)
          const isToday = date === today
          const dayHours = daySlots.reduce((s, sl) => s + (sl.check_ins?.[0]?.total_hours || 0), 0)
          return (
            <div key={date} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <h3 className={`text-sm font-bold ${isToday ? 'text-brand-700' : 'text-gray-700'}`}>
                  {DAYS_ID[d.getDay()]}, {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}
                  {isToday && <span className="ml-2 text-[10px] bg-brand-600 text-white px-1.5 py-0.5 rounded-full">Hari Ini</span>}
                </h3>
                {dayHours > 0 && <span className="text-xs text-gray-400">{dayHours.toFixed(1)} jam</span>}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                {daySlots.map(slot => {
                  const details = [slot.konsep, slot.background, slot.kostum, slot.gimmick].filter(Boolean)
                  return (
                    <div key={slot.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="font-mono text-[11px] text-gray-500 w-24 flex-shrink-0 pt-0.5">{slotTimeLabel(slot)}</span>
                      <div className="flex-1 min-w-0">
                        {/* Brand is the title */}
                        <p className="font-bold text-gray-900 text-sm">{slot.brand || '—'}</p>
                        {/* Room as subtitle */}
                        <p className="text-xs text-gray-500">{slot.rooms?.name}</p>
                        {details.length > 0 && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{details.join(' · ')}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {slot.platform && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[slot.platform] || PLATFORM_COLORS.Other}`}>
                            {slot.platform}
                          </span>
                        )}
                        {slot.check_ins?.[0]?.total_hours && (
                          <span className="text-xs text-emerald-600 font-medium">
                            ✓ {slot.check_ins[0].total_hours}h
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}
