import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AccountingClient from './AccountingClient'

export default async function AccountingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'superadmin') redirect('/dashboard')

  return <AccountingClient profile={profile} />
}
