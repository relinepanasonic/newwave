'use client'
import { useState } from 'react'
import AppShell from '@/components/AppShell'
import { CalendarDays, BarChart2, Camera, GitCompareArrows } from 'lucide-react'
import { cn } from '@/lib/utils'
import RecapTab from './RecapClient'
import ReportDetailTab from './ReportDetailTab'
import LookApprovalLogTab from './LookApprovalLogTab'
import RekonsiliasiTab from './RekonsiliasiTab'

type Tab = 'recap' | 'report' | 'looklog' | 'rekonsiliasi'

const TABS: { key: Tab; label: string; shortLabel: string; icon: any }[] = [
  { key: 'recap',        label: 'Recap Schedule',    shortLabel: 'Recap',    icon: CalendarDays },
  { key: 'report',       label: 'Live Report Detail', shortLabel: 'Report',  icon: BarChart2 },
  { key: 'looklog',      label: 'Look Approval Log',  shortLabel: 'Look Log', icon: Camera },
  { key: 'rekonsiliasi', label: 'Rekonsiliasi',       shortLabel: 'Rekon',   icon: GitCompareArrows },
]

export default function LiveDetailsClient({ profile }: { profile: any }) {
  const [tab, setTab] = useState<Tab>('recap')

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className={cn('p-4 sm:p-6 mx-auto', tab === 'rekonsiliasi' || tab === 'report' ? 'max-w-full' : 'max-w-5xl')}>

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">Live Details</h1>
          <p className="text-sm text-gray-500 mt-0.5">Rekap jadwal & detail laporan live semua host</p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
          {TABS.map(({ key, label, shortLabel, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn('flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0',
                tab === key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600')}>
              <Icon size={15} className="flex-shrink-0"/>
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {tab === 'recap' && <RecapTab profile={profile} />}
        {tab === 'report' && <ReportDetailTab profile={profile} />}
        {tab === 'looklog' && <LookApprovalLogTab profile={profile} />}
        {tab === 'rekonsiliasi' && <RekonsiliasiTab profile={profile} />}
      </div>
    </AppShell>
  )
}
