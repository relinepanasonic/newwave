'use client'
import AuthGuard from '@/components/AuthGuard'
import HostsClient from './HostsClient'

export default function OnboardingPage() {
  return (
    <AuthGuard requiredRole={['superadmin']}>
      {(profile) => <HostsClient profile={profile} />}
    </AuthGuard>
  )
}
