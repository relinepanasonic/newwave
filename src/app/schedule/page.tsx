'use client'
import AuthGuard from '@/components/AuthGuard'
import ScheduleLoader from './ScheduleLoader'

export default function SchedulePage() {
  return (
    <AuthGuard requiredRole={['superadmin', 'host']}>
      {(profile) => <ScheduleLoader profile={profile} />}
    </AuthGuard>
  )
}
