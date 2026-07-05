'use client'
import AuthGuard from '@/components/AuthGuard'
import LiveReportClient from './LiveReportClient'

export default function LiveReportPage() {
  return (
    <AuthGuard requiredRole={['host', 'host_manager', 'superadmin']}>
      {(profile) => <LiveReportClient profile={profile} />}
    </AuthGuard>
  )
}
