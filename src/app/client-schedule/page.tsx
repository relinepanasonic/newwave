import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientScheduleClient from './ClientScheduleClient'

export default async function ClientSchedulePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const today = new Date()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  let query = supabase
    .from('schedule_slots')
    .select('*, rooms(name, group_name), profiles(full_name)')
    .gte('slot_date', weekStart.toISOString().split('T')[0])
    .lte('slot_date', weekEnd.toISOString().split('T')[0])
    .not('host_id', 'is', null)
    .order('slot_date').order('session_no')

  if (profile.role === 'client' && profile.client_brand) {
    query = query.ilike('brand', `%${profile.client_brand}%`)
  }

  const { data: slots } = await query

  return <ClientScheduleClient profile={profile} slots={slots || []} weekStart={weekStart.toISOString()} />
}
