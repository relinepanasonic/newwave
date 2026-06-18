'use client'
import AuthGuard from '@/components/AuthGuard'
import LiveReportClient from './LiveReportClient'

export default function LiveReportPage() {
  return (
    <AuthGuard requiredRole={['host', 'superadmin']}>
      {(profile) => <LiveReportClient profile={profile} />}
    </AuthGuard>
  )
}
