import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Permanently remove a host (e.g. fired): deletes profile row + auth user.
export async function POST(req: Request) {
  const { host_id } = await req.json()

  if (!host_id) {
    return NextResponse.json({ error: 'host_id wajib diisi' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Delete the profile first (so they're locked out even if auth delete fails)
  const { error: profErr } = await admin.from('profiles').delete().eq('id', host_id)
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 400 })
  }

  // Delete the auth user (non-fatal if already gone)
  await admin.auth.admin.deleteUser(host_id)

  return NextResponse.json({ success: true })
}
