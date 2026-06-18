import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RoomsClient from './RoomsClient'

export default async function RoomsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'superadmin') redirect('/dashboard')
  const { data: rooms } = await supabase.from('rooms').select('*').order('sort_order')
  return <RoomsClient profile={profile} rooms={rooms || []} />
}
