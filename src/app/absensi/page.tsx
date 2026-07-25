import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AbsensiClient from './AbsensiClient'

export default async function AbsensiPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'operator') redirect('/dashboard')

  return <AbsensiClient profile={profile} />
}
