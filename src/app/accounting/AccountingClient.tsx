'use client'
import AppShell from '@/components/AppShell'
import { BookOpen } from 'lucide-react'

export default function AccountingClient({ profile }: { profile: any }) {
  return (
    <AppShell role="superadmin" userName={profile.full_name}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen size={22} className="text-brand-600"/> Accounting
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Laporan keuangan & data akuntansi</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center text-gray-400">
          <BookOpen size={40} className="mx-auto mb-3 text-gray-200"/>
          <p className="text-sm font-medium">Halaman ini siap digunakan</p>
          <p className="text-xs mt-1 text-gray-300">Laporan dari aplikasi akuntansi akan tampil di sini</p>
        </div>
      </div>
    </AppShell>
  )
}
