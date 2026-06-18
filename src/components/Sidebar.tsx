'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CalendarDays, Users, DollarSign,
  DoorOpen, LogIn, LogOut, Globe, BarChart2, ClipboardList,
  X, Shield,
} from 'lucide-react'
import type { Lang } from '@/lib/i18n'
import { tr } from '@/lib/i18n'

type Role = 'superadmin' | 'host' | 'client'

interface Props {
  role: Role
  lang: Lang
  onLangToggle: () => void
  userName: string
  onClose?: () => void
}

const NAV_SUPERADMIN = [
  { key: 'dashboard',      icon: LayoutDashboard, href: '/dashboard' },
  { key: 'schedule',       icon: CalendarDays,    href: '/schedule' },
  { key: 'recapschedule',  icon: ClipboardList,   href: '/recap-schedule' },
  { key: 'payroll',        icon: DollarSign,      href: '/payroll' },
  { key: 'brandreport',    icon: BarChart2,       href: '/brand-report' },
  { key: 'rooms',          icon: DoorOpen,        href: '/rooms' },
  { key: 'hrd',            icon: Shield,          href: '/hrd' },
  { key: 'onboarding',     icon: Users,           href: '/hosts' },
]

const NAV_HOST = [
  { key: 'dashboard',   icon: LayoutDashboard, href: '/dashboard' },
  { key: 'myschedule',  icon: CalendarDays,    href: '/my-schedule' },
  { key: 'livereport',  icon: BarChart2,       href: '/live-report' },
]

const NAV_CLIENT = [
  { key: 'clientschedule', icon: CalendarDays, href: '/client-schedule' },
  { key: 'brandreport',    icon: BarChart2,    href: '/brand-report' },
]

export default function Sidebar({ role, lang, onLangToggle, userName, onClose }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const navItems = role === 'superadmin' ? NAV_SUPERADMIN : role === 'host' ? NAV_HOST : NAV_CLIENT

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const roleLabel: Record<Role, string> = {
    superadmin: 'Super Admin',
    host: 'Host',
    client: 'Client',
  }

  return (
    <aside className="h-full w-[220px] bg-white border-r border-gray-100 shadow-sm flex flex-col">
      {/* Logo + close button */}
      <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">NW</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900 leading-tight truncate">New Wave</p>
            <p className="text-[10px] text-gray-400 leading-tight">Live Specialist</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ key, icon: Icon, href }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={key}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon size={16} className={active ? 'text-brand-600' : 'text-gray-400'} />
              {tr(key, lang)}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-gray-100 space-y-1">
        <button
          onClick={onLangToggle}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <Globe size={16} className="text-gray-400" />
          {lang === 'id' ? 'Switch to English' : 'Ganti ke Indonesia'}
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={16} />
          {tr('logout', lang)}
        </button>

        <div className="mt-2 px-3 py-2 bg-brand-50 rounded-xl">
          <p className="text-xs font-semibold text-brand-800 truncate">{userName}</p>
          <p className="text-[10px] text-brand-500">{roleLabel[role]}</p>
        </div>
      </div>
    </aside>
  )
}
