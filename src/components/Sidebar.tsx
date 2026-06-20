'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CalendarDays, Users,
  BarChart2, ClipboardList, X, Shield, FileText, Briefcase,
} from 'lucide-react'
import type { Lang } from '@/lib/i18n'
import { tr } from '@/lib/i18n'

type Role = 'superadmin' | 'host' | 'client'

interface Props {
  role: Role
  lang?: Lang
  userName: string
  onClose?: () => void
}

const NAV_SUPERADMIN = [
  { key: 'dashboard',     icon: LayoutDashboard, href: '/dashboard' },
  { key: 'schedule',      icon: CalendarDays,    href: '/schedule' },
  { key: 'recapschedule', icon: ClipboardList,   href: '/recap-schedule' },
  { key: 'clients',       icon: Briefcase,       href: '/clients' },
  { key: 'hrd',           icon: Shield,          href: '/hrd' },
  { key: 'onboarding',    icon: Users,           href: '/hosts' },
]

const NAV_HOST = [
  { key: 'dashboard',   icon: LayoutDashboard, href: '/dashboard' },
  { key: 'myschedule',  icon: CalendarDays,    href: '/my-schedule' },
  { key: 'livereport',  icon: BarChart2,       href: '/live-report' },
]

const NAV_CLIENT = [
  { key: 'dashboard',      icon: LayoutDashboard, href: '/dashboard' },
  { key: 'clientschedule', icon: CalendarDays,    href: '/client-schedule' },
  { key: 'invoice',        icon: FileText,        href: '/invoice' },
  { key: 'brandreport',    icon: BarChart2,       href: '/brand-report' },
]

export default function Sidebar({ role, lang = 'id', userName, onClose }: Props) {
  const pathname = usePathname()
  const navItems = role === 'superadmin' ? NAV_SUPERADMIN : role === 'host' ? NAV_HOST : NAV_CLIENT

  const roleLabel: Record<Role, string> = {
    superadmin: 'Super Admin',
    host: 'Host',
    client: 'Client',
  }

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('')

  return (
    <aside className="h-full w-[220px] bg-white border-r border-gray-100 flex flex-col">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white text-xs font-bold tracking-tight">NW</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900 leading-tight">New Wave</p>
            <p className="text-[10px] text-gray-400 leading-tight">Live Specialist</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ key, icon: Icon, href }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={key}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon
                size={15}
                className={active ? 'text-white' : 'text-gray-400'}
              />
              {tr(key, lang)}
            </Link>
          )
        })}
      </nav>

      {/* User card */}
      <div className="px-3 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white text-xs font-bold">{initials || '?'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{userName}</p>
            <span className="text-[9px] font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full inline-block mt-0.5">
              {roleLabel[role]}
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}
