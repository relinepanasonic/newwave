'use client'
import AuthGuard from '@/components/AuthGuard'
import ClientsClient from './ClientsClient'

export default function ClientsPage() {
  return (
    <AuthGuard requiredRole={['superadmin']}>
      {(profile) => <ClientsClient profile={profile}/>}
    </AuthGuard>
  )
}
