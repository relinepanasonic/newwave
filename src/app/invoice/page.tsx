'use client'
import AuthGuard from '@/components/AuthGuard'
import InvoiceClient from './InvoiceClient'

export default function InvoicePage() {
  return (
    <AuthGuard>
      {(profile) => <InvoiceClient profile={profile} />}
    </AuthGuard>
  )
}
