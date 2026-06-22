import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Permanently remove a host (fired).
// Deletes all rows that have NOT NULL FKs to profiles, then deletes the profile.
// schedule_slots + live_reports can be kept (host_id nulled) or deleted based on clear_data.
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

  // Step 1: Null nullable created_by refs (safe to do any time)
  await admin.from('schedule_slots').update({ created_by: null } as any).eq('created_by', host_id)
  await admin.from('brand_products').update({ created_by: null } as any).eq('created_by', host_id)

  // Step 2: Delete check_ins — host_id is NOT NULL (no cascade), must delete rows
  await admin.from('check_ins').delete().eq('host_id', host_id)

  // Step 3: Delete live_report_products first (FK → live_reports), then live_reports
  // live_reports.host_id is NOT NULL — cannot be nulled, must delete rows
  await admin.from('live_report_products').delete().eq('host_id', host_id)
  await admin.from('live_reports').delete().eq('host_id', host_id)

  // Step 4: schedule_slots.host_id is nullable — null it or delete based on user choice
  if (clear_data) {
    await admin.from('schedule_slots').delete().eq('host_id', host_id)
  } else {
    await admin.from('schedule_slots').update({ host_id: null } as any).eq('host_id', host_id)
  }

  // Step 5: Delete the profile row
  const { error: profErr } = await admin.from('profiles').delete().eq('id', host_id)
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 400 })
  }

  // Step 6: Delete the auth user (non-fatal if already gone)
  await admin.auth.admin.deleteUser(host_id)

  return NextResponse.json({ success: true })
}
