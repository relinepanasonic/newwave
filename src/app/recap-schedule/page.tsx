'use client'
import AuthGuard from '@/components/AuthGuard'
import RecapClient from './RecapClient'

export default function RecapSchedulePage() {
  return (
    <AuthGuard requiredRole={['superadmin']}>
      {(profile) => <RecapClient profile={profile} />}
    </AuthGuard>
  )
}
