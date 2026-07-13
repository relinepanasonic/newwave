'use client'
import AuthGuard from '@/components/AuthGuard'
import LiveDetailsClient from './LiveDetailsClient'

export default function LiveDetailsPage() {
  return (
    <AuthGuard requiredRole={['superadmin', 'host_manager']}>
      {(profile) => <LiveDetailsClient profile={profile} />}
    </AuthGuard>
  )
}
