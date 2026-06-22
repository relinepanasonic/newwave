import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Permanently remove a host (e.g. fired): deletes profile row + auth user.
export async function POST(req: Request) {
  const { host_id, clear_data = false } = await req.json()

  if (!host_id) {
    return NextResponse.json({ error: 'host_id wajib diisi' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 1. Null created_by references (always nullable)
  await admin.from('schedule_slots').update({ created_by: null } as any).eq('created_by', host_id)
  await admin.from('brand_products').update({ created_by: null } as any).eq('created_by', host_id)

  // 2. check_ins.host_id is NOT NULL — must delete these rows regardless
  await admin.from('check_ins').delete().eq('host_id', host_id)

  // 3. schedule_slots + live_reports: delete or detach based on user choice
  if (clear_data) {
    await admin.from('schedule_slots').delete().eq('host_id', host_id)
    await admin.from('live_reports').delete().eq('host_id', host_id)
  } else {
    await admin.from('schedule_slots').update({ host_id: null } as any).eq('host_id', host_id)
    await admin.from('live_reports').update({ host_id: null } as any).eq('host_id', host_id)
  }

  // 4. Delete the profile row
  const { error: profErr } = await admin.from('profiles').delete().eq('id', host_id)
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 400 })
  }

  // 5. Delete the auth user (non-fatal if already gone)
  await admin.auth.admin.deleteUser(host_id)

  return NextResponse.json({ success: true })
}
