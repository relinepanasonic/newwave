import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientScheduleClient from './ClientScheduleClient'

export default async function ClientSchedulePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')
  return <ClientScheduleClient profile={profile} />
}
