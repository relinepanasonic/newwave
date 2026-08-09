'use client'
import AuthGuard from '@/components/AuthGuard'
import HostDashboard from './HostDashboard'
import ReportBody from './ReportBody'

export default function DashboardPage() {
  return (
    <AuthGuard>
      {(profile) => {
        if (profile.role === 'host') return <HostDashboard profile={profile} />
        return <ReportBody profile={profile} />
      }}
    </AuthGuard>
  )
}
