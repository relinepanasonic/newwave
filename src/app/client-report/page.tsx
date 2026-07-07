'use client'
import AuthGuard from '@/components/AuthGuard'
import ClientReportClient from './ClientReportClient'

export default function ClientReportPage() {
  return (
    <AuthGuard requiredRole={['client', 'superadmin', 'host_manager', 'operator']}>
      {(profile) => <ClientReportClient profile={profile} />}
    </AuthGuard>
  )
}
