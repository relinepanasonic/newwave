'use client'
import AuthGuard from '@/components/AuthGuard'
import ScheduleLoader from './ScheduleLoader'

export default function SchedulePage() {
  return (
    <AuthGuard requiredRole={['superadmin', 'host_manager', 'operator']}>
      {(profile) => <ScheduleLoader profile={profile} />}
    </AuthGuard>
  )
}
