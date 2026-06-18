'use client'
import { useState } from 'react'
import AppShell from '@/components/AppShell'
import { Users, CalendarDays, Activity, Clock } from 'lucide-react'
import { getPayPeriod, PLATFORM_COLORS, STATUS_COLORS, SESSION_LABELS } from '@/lib/utils'
import { tr, type Lang } from '@/lib/i18n'

interface Props {
  profile: { full_name: string; role: string }
  slotsToday: any[]
  slotsThisMonth: number
  activeHosts: number
}

export default function DashboardClient({ profile, slotsToday, slotsThisMonth, activeHosts }: Props) {
  const [lang, setLang] = useState<Lang>('id')
  const payPeriod = getPayPeriod()
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const filledToday = slotsToday.filter(s => s.host_id)
  const liveNow = slotsToday.filter(s => s.status === 'live')

  const stats = [
    {
      label: tr('totalHosts', lang),
      value: activeHosts,
      icon: Users,
      color: 'bg-brand-100 text-brand-700',
      iconColor: 'text-brand-600',
    },
    {
      label: tr('totalSessions', lang) + ' ' + tr('thisMonth', lang),
      value: slotsThisMonth,
      icon: CalendarDays,
      color: 'bg-blue-100 text-blue-700',
      iconColor: 'text-blue-600',
    },
    {
      label: tr('sessionToday', lang),
      value: filledToday.length,
      icon: Clock,
      color: 'bg-emerald-100 text-emerald-700',
      iconColor: 'text-emerald-600',
    },
    {
      label: 'Live Sekarang',
      value: liveNow.length,
      icon: Activity,
      color: 'bg-red-100 text-red-700',
      iconColor: 'text-red-600',
    },
  ]

  // Group today's slots by room
  const byRoom: Record<string, any[]> = {}
  slotsToday.forEach(s => {
    const roomName = s.rooms?.name || 'Unknown'
    if (!byRoom[roomName]) byRoom[roomName] = []
    byRoom[roomName].push(s)
  })

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === 'id' ? `Halo, ${profile.full_name.split(' ')[0]} 👋` : `Hello, ${profile.full_name.split(' ')[0]} 👋`}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
          <div className="mt-2 inline-flex items-center gap-1.5 bg-brand-50 border border-brand-200 text-brand-700 text-xs font-medium px-3 py-1.5 rounded-full">
            <CalendarDays size={12} />
            {tr('payPeriod', lang)}: {payPeriod.label}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ label, value, icon: Icon, color, iconColor }) => (
            <div key={label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 ${color}`}>
                <Icon size={16} className={iconColor} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* Today's schedule mini view */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">
              {lang === 'id' ? 'Jadwal Hari Ini' : "Today's Schedule"}
            </h2>
            <a href="/schedule" className="text-xs text-brand-600 hover:underline font-medium">
              {lang === 'id' ? 'Lihat Semua →' : 'View All →'}
            </a>
          </div>

          {filledToday.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              {lang === 'id' ? 'Belum ada sesi hari ini' : 'No sessions scheduled today'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-semibold">{tr('session', lang)}</th>
                    <th className="px-4 py-3 text-left font-semibold">{tr('room', lang)}</th>
                    <th className="px-4 py-3 text-left font-semibold">{tr('host', lang)}</th>
                    <th className="px-4 py-3 text-left font-semibold">{tr('brand', lang)}</th>
                    <th className="px-4 py-3 text-left font-semibold">{tr('platform', lang)}</th>
                    <th className="px-4 py-3 text-left font-semibold">{tr('status', lang)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filledToday.map((slot: any) => (
                    <tr key={slot.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {SESSION_LABELS[slot.session_no]}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{slot.rooms?.name}</td>
                      <td className="px-4 py-3 text-gray-700">{slot.profiles?.full_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{slot.brand || '—'}</td>
                      <td className="px-4 py-3">
                        {slot.platform && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[slot.platform] || PLATFORM_COLORS.Other}`}>
                            {slot.platform}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[slot.status] || STATUS_COLORS.scheduled}`}>
                          {tr(slot.status, lang)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
