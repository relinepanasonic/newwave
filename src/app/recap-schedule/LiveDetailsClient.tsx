'use client'
import { useState } from 'react'
import AppShell from '@/components/AppShell'
import { CalendarDays, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import RecapTab from './RecapClient'
import ReportDetailTab from './ReportDetailTab'

type Tab = 'recap' | 'report'

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'recap',  label: 'Recap Schedule',    icon: CalendarDays },
  { key: 'report', label: 'Live Report Detail', icon: BarChart2 },
]

export default function LiveDetailsClient({ profile }: { profile: any }) {
  const [tab, setTab] = useState<Tab>('recap')

  return (
    <AppShell role="superadmin" userName={profile.full_name}>
      <div className="p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">Live Details</h1>
          <p className="text-sm text-gray-500 mt-0.5">Rekap jadwal & detail laporan live semua host</p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600')}>
              <Icon size={15}/> {label}
            </button>
          ))}
        </div>

        {tab === 'recap' ? <RecapTab profile={profile} /> : <ReportDetailTab />}
      </div>
    </AppShell>
  )
}
