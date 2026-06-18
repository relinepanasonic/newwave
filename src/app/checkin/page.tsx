import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CheckinClient from './CheckinClient'

export default async function CheckinPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role === 'client') redirect('/dashboard')

  const today = new Date().toISOString().split('T')[0]

  // Get today's slots for this host (or all if admin)
  const query = supabase
    .from('schedule_slots')
    .select('*, rooms(name, group_name), check_ins(*)')
    .eq('slot_date', today)
    .order('session_no')

  if (profile.role === 'host') query.eq('host_id', user.id)

  const { data: slots } = await query

  return <CheckinClient profile={profile} slots={slots || []} today={today} />
}
