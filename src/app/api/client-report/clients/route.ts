import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Lists all client brands so superadmin/host_manager/operator can pick one to
// generate a report for. RLS blocks host_manager/operator from listing other
// profiles (only superadmin bypasses via is_superadmin()), so this uses the
// service role after verifying the caller's own role server-side.
export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!me || !['superadmin', 'host_manager', 'operator'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, client_brand')
    .eq('role', 'client')
    .not('client_brand', 'is', null)
    .order('client_brand')

  return NextResponse.json({ clients: data || [] })
}
