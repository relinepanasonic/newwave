'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'
import { cn } from '@/lib/utils'
import { Menu, Globe, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Lang } from '@/lib/i18n'

interface Props {
  role: 'superadmin' | 'host' | 'client'
  userName: string
  children: React.ReactNode
}

export default function AppShell({ role, userName, children }: Props) {
  const [lang, setLang] = useState<Lang>('id')
  const [open, setOpen] = useState(false)
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

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
          userName={userName}
          onClose={() => setOpen(false)}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 lg:ml-[220px] min-h-screen overflow-x-hidden">
        {/* Top bar — always visible */}
        <div className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex items-center shadow-sm">
          {/* Left: hamburger (mobile) + logo (mobile) */}
          <div className="flex items-center gap-3 lg:hidden">
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

          {/* Right: lang toggle + logout */}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setLang(l => l === 'id' ? 'en' : 'id')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-gray-500 hover:bg-gray-100 transition-colors font-medium"
            >
              <Globe size={14} className="text-gray-400" />
              <span className="hidden sm:inline">{lang === 'id' ? 'English' : 'Indonesia'}</span>
              <span className="sm:hidden">{lang === 'id' ? 'EN' : 'ID'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors font-medium"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>

        <div data-lang={lang}>
          {children}
        </div>
      </main>
    </div>
  )
}
