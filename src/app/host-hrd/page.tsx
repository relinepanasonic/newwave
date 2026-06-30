import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import HostHRDClient from './HostHRDClient'

export default async function HostHRDPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'host') redirect('/dashboard')

  return <HostHRDClient profile={profile} />
}
