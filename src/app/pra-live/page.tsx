'use client'
import AuthGuard from '@/components/AuthGuard'
import PraLiveClient from './PraLiveClient'

export default function PraLivePage() {
  return (
    <AuthGuard requiredRole={['host', 'superadmin']}>
      {(profile) => <PraLiveClient profile={profile} />}
    </AuthGuard>
  )
}
