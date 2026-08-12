import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Login emails live in auth.users, not profiles (profiles has no email
// column), so they can only be read with the service role -- hence this
// route rather than a client-side query. Returns { [userId]: email } for
// every account, for the Hosts > Client list to display.
export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // listUsers is paginated and silently caps out otherwise.
  const emails: Record<string, string> = {}
  const perPage = 1000
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    data.users.forEach(u => { if (u.email) emails[u.id] = u.email })
    if (data.users.length < perPage) break
  }

  return NextResponse.json({ emails })
}
