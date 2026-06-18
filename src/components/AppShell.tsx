'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'
import { cn } from '@/lib/utils'
import { Menu } from 'lucide-react'
import type { Lang } from '@/lib/i18n'

interface Props {
  role: 'superadmin' | 'host' | 'client'
  userName: string
  children: React.ReactNode
}

export default function AppShell({ role, userName, children }: Props) {
  const [lang, setLang] = useState<Lang>('id')
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar — fixed drawer, hidden off-screen on mobile */}
      <div className={cn(
        'fixed left-0 top-0 h-full z-50 transition-transform duration-200 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <Sidebar
          role={role}
          lang={lang}
          onLangToggle={() => setLang(l => l === 'id' ? 'en' : 'id')}
          userName={userName}
          onClose={() => setOpen(false)}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 lg:ml-[220px] min-h-screen overflow-x-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm">
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <Menu size={20} className="text-gray-700" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[10px] font-bold">NW</span>
            </div>
            <span className="font-bold text-gray-900 text-sm">New Wave Live</span>
          </div>
        </div>

        <div data-lang={lang}>
          {children}
        </div>
      </main>
    </div>
  )
}
