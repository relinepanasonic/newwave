'use client'
import { useState } from 'react'
import AppShell from '@/components/AppShell'
import { CalendarDays, BarChart2, GitCompareArrows, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tr } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'
import RecapTab from './RecapClient'
import ReportDetailTab from './ReportDetailTab'
import RekonsiliasiTab from './RekonsiliasiTab'
import DuplicateReportsTab from './DuplicateReportsTab'

type Tab = 'recap' | 'report' | 'rekonsiliasi' | 'duplicates'

const TABS: { key: Tab; labelKey: string; shortKey: string; icon: any }[] = [
  { key: 'recap',        labelKey: 'recapschedule',    shortKey: 'recap', icon: CalendarDays },
  { key: 'report',       labelKey: 'liveReportDetail',  shortKey: 'reportShort', icon: BarChart2 },
  { key: 'rekonsiliasi', labelKey: 'rekonsiliasi',      shortKey: 'rekon', icon: GitCompareArrows },
  { key: 'duplicates',   labelKey: 'duplicateReports',  shortKey: 'duplicateReportsShort', icon: Copy },
]

export default function LiveDetailsClient({ profile }: { profile: any }) {
  const { lang } = useLang()
  const [tab, setTab] = useState<Tab>('recap')
  // Bumped whenever Duplikat changes live_reports data, so Reconciliation
  // (which caches its own snapshot) knows to refetch instead of quietly
  // going stale -- see the two tabs' own comments for the full story.
  const [refreshSignal, setRefreshSignal] = useState(0)

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-4 sm:p-6 mx-auto max-w-full">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">{tr('livedetails', lang)}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tr('recapDesc', lang)}</p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
          {TABS.map(({ key, labelKey, shortKey, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn('flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0',
                tab === key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600')}>
              <Icon size={15} className="flex-shrink-0"/>
              <span className="sm:hidden">{tr(shortKey, lang)}</span>
              <span className="hidden sm:inline">{tr(labelKey, lang)}</span>
            </button>
          ))}
        </div>

        {/* All four tabs stay mounted (hidden via CSS, not unmounted) so
            switching tabs never loses an in-progress CSV upload, and so
            Reconciliation is still listening for refreshSignal even while
            you're on a different tab. */}
        <div className={tab === 'recap' ? '' : 'hidden'}><RecapTab profile={profile} /></div>
        <div className={tab === 'report' ? '' : 'hidden'}><ReportDetailTab profile={profile} /></div>
        <div className={tab === 'rekonsiliasi' ? '' : 'hidden'}><RekonsiliasiTab profile={profile} refreshSignal={refreshSignal} /></div>
        <div className={tab === 'duplicates' ? '' : 'hidden'}><DuplicateReportsTab onDataChanged={() => setRefreshSignal(s => s + 1)} /></div>
      </div>
    </AppShell>
  )
}
