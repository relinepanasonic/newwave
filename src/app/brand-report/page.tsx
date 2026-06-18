'use client'
import { useState, useEffect } from 'react'
import AuthGuard from '@/components/AuthGuard'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { SESSION_LABELS, PLATFORM_COLORS, toLocalDateStr, getWeekDates } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { tr, type Lang } from '@/lib/i18n'

const DAYS_ID = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu']

function BrandReportContent({ profile }: { profile: any }) {
  const [lang] = useState<Lang>('id')
  const [baseDate, setBaseDate] = useState(new Date())
  const [weekDates, setWeekDates] = useState<Date[]>(getWeekDates(new Date()))
  const [slots, setSlots] = useState<any[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [selectedBrand, setSelectedBrand] = useState<string>('all')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setWeekDates(getWeekDates(baseDate))
  }, [baseDate])

  useEffect(() => {
    if (!weekDates.length) return
    setLoading(true)
    const supabase = createClient()
    const from = toLocalDateStr(weekDates[0])
    const to = toLocalDateStr(weekDates[6])
    supabase.from('schedule_slots')
      .select('*, rooms(name, group_name), profiles(full_name)')
      .gte('slot_date', from).lte('slot_date', to)
      .not('host_id', 'is', null)
      .order('slot_date').order('session_no')
      .then(({ data }) => {
        const s = data || []
        setSlots(s)
        const uniqueBrands = Array.from(new Set(s.map((sl: any) => sl.brand).filter(Boolean))) as string[]
        setBrands(uniqueBrands.sort())
        // If client, auto-filter by their brand
        if (profile.role === 'client' && profile.client_brand) {
          setSelectedBrand(profile.client_brand)
        }
        setLoading(false)
      })
  }, [weekDates, profile])

  const filtered = selectedBrand === 'all'
    ? slots
    : slots.filter(s => s.brand?.toLowerCase().includes(selectedBrand.toLowerCase()))

  // Group by date
  const byDate: Record<string, any[]> = {}
  filtered.forEach(s => {
    if (!byDate[s.slot_date]) byDate[s.slot_date] = []
    byDate[s.slot_date].push(s)
  })

  const totalSessions = filtered.length
  const uniqueHosts = new Set(filtered.map(s => s.host_id)).size

  return (
    <AppShell role={profile.role} userName={profile.full_name}>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {lang === 'id' ? 'Laporan per Brand' : 'Brand Report'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {lang === 'id' ? 'Jadwal live per brand/client' : 'Live schedule per brand/client'}
            </p>
          </div>
          {/* Week nav */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-2 py-1.5">
            <button onClick={() => { const d=new Date(baseDate); d.setDate(d.getDate()-7); setBaseDate(d) }}
              className="p-1 rounded-lg hover:bg-gray-100"><ChevronLeft size={15}/></button>
            <span className="text-xs font-semibold text-gray-700 px-2">
              {weekDates[0] && toLocalDateStr(weekDates[0])} – {weekDates[6] && toLocalDateStr(weekDates[6])}
            </span>
            <button onClick={() => { const d=new Date(baseDate); d.setDate(d.getDate()+7); setBaseDate(d) }}
              className="p-1 rounded-lg hover:bg-gray-100"><ChevronRight size={15}/></button>
          </div>
        </div>

        {/* Filter bar */}
        {profile.role !== 'client' && (
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 max-w-xs">
              <Search size={14} className="text-gray-400"/>
              <select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)}
                className="flex-1 text-sm focus:outline-none bg-transparent">
                <option value="all">{lang === 'id' ? 'Semua Brand' : 'All Brands'}</option>
                {brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            {/* Stats */}
            <div className="flex gap-3">
              <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-2 text-center">
                <p className="text-lg font-bold text-brand-700">{totalSessions}</p>
                <p className="text-[10px] text-brand-500">Sesi</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2 text-center">
                <p className="text-lg font-bold text-emerald-700">{uniqueHosts}</p>
                <p className="text-[10px] text-emerald-500">Host</p>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
            Memuat...
          </div>
        ) : Object.keys(byDate).length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <p className="text-gray-400 text-sm">
              {selectedBrand === 'all'
                ? 'Tidak ada jadwal minggu ini'
                : `Tidak ada jadwal untuk brand "${selectedBrand}" minggu ini`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).map(([date, daySlots]) => {
              const d = new Date(date)
              const dayIdx = (d.getDay() + 6) % 7
              return (
                <div key={date} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Day header */}
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-800">
                        {DAYS_ID[dayIdx]}, {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                    <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                      {daySlots.length} sesi
                    </span>
                  </div>

                  {/* Slots table */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-50">
                        <th className="px-4 py-2 text-left font-semibold w-24">Waktu</th>
                        <th className="px-4 py-2 text-left font-semibold">Ruangan</th>
                        <th className="px-4 py-2 text-left font-semibold">Host</th>
                        <th className="px-4 py-2 text-left font-semibold">Brand</th>
                        <th className="px-4 py-2 text-left font-semibold">Platform</th>
                        <th className="px-4 py-2 text-left font-semibold">Konsep</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {daySlots.map(slot => (
                        <tr key={slot.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{SESSION_LABELS[slot.session_no]}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-900 text-xs">{slot.rooms?.name}</td>
                          <td className="px-4 py-2.5 text-gray-700 text-xs">{slot.profiles?.full_name || '—'}</td>
                          <td className="px-4 py-2.5 text-gray-600 text-xs font-medium">{slot.brand || '—'}</td>
                          <td className="px-4 py-2.5">
                            {slot.platform && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[slot.platform] || PLATFORM_COLORS.Other}`}>
                                {slot.platform}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">{slot.konsep || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}

export default function BrandReportPage() {
  return (
    <AuthGuard>
      {(profile) => <BrandReportContent profile={profile} />}
    </AuthGuard>
  )
}
