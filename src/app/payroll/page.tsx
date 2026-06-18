import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PayrollClient from './PayrollClient'

export default async function PayrollPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'superadmin') redirect('/dashboard')

  const { data: summary } = await supabase.from('payroll_summary').select('*').order('period_start', { ascending: false })
  const { data: hosts } = await supabase.from('profiles').select('id, full_name, hourly_rate').eq('role', 'host').eq('is_active', true)

  return <PayrollClient profile={profile} summary={summary || []} hosts={hosts || []} />
}
