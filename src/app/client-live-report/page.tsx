import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientLiveReportClient from './ClientLiveReportClient'

export default async function ClientLiveReportPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')
  if (profile.role !== 'client') redirect('/dashboard')
  return <ClientLiveReportClient profile={profile} />
}
