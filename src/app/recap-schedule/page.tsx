'use client'
import AuthGuard from '@/components/AuthGuard'
import LiveDetailsClient from './LiveDetailsClient'

export default function LiveDetailsPage() {
  return (
    <AuthGuard requiredRole={['superadmin']}>
      {(profile) => <LiveDetailsClient profile={profile} />}
    </AuthGuard>
  )
}
