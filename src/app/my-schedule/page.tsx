import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MyScheduleClient from './MyScheduleClient'

export default async function MySchedulePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role === 'client') redirect('/client-schedule')

  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]

  const query = supabase
    .from('schedule_slots')
    .select('*, rooms(name, group_name), check_ins(*)')
    .gte('slot_date', monthStart)
    .lte('slot_date', monthEnd)
    .order('slot_date').order('session_no')

  if (profile.role === 'host') query.eq('host_id', user.id)

  const { data: slots } = await query

  return <MyScheduleClient profile={profile} slots={slots || []} />
}
