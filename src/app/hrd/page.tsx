'use client'
import AuthGuard from '@/components/AuthGuard'
import HRDClient from './HRDClient'

export default function HRDPage() {
  return (
    <AuthGuard requiredRole={['superadmin']}>
      {(profile) => <HRDClient profile={profile} />}
    </AuthGuard>
  )
}
