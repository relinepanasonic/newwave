'use client'
import AppShell from '@/components/AppShell'
import InvoicePanel from './InvoicePanel'

export default function InvoiceClient({ profile }: { profile: any }) {
  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <InvoicePanel profile={profile}/>
    </AppShell>
  )
}
