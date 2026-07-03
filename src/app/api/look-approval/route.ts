import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Body: { slot_id, look_approval_at, look_approval_url? }
// Hosts cannot UPDATE schedule_slots (RLS allows superadmin only), so we use
// the service-role key here after verifying the slot belongs to the caller.
export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slot_id, look_approval_at, look_approval_url } = await req.json()
  if (!slot_id || !look_approval_at) {
    return NextResponse.json({ error: 'slot_id and look_approval_at required' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify this slot belongs to the caller before writing
  const { data: slot, error: fetchErr } = await admin
    .from('schedule_slots')
    .select('host_id')
    .eq('id', slot_id)
    .single()

  if (fetchErr || !slot) {
    return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
  }
  if (slot.host_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await admin
    .from('schedule_slots')
    .update({ look_approval_at, look_approval_url: look_approval_url ?? null })
    .eq('id', slot_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
