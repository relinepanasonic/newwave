import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Client self-signup from an invite link. Deliberately separate from
// /api/onboard: that one is host onboarding (KTP upload, Drive folder,
// tipe_host/target_hours/hourly_rate). A client only needs a login and the
// brand the admin already assigned on the invite.
export async function POST(req: Request) {
  const { token, full_name, email, password, phone } = await req.json()
  if (!token || !full_name || !email || !password) {
    return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 })
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 })
  }

  const supabase = admin()

  const { data: invite, error: inviteErr } = await supabase
    .from('onboarding_invites')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .single()

  if (inviteErr || !invite) {
    return NextResponse.json({ error: 'Link tidak valid atau sudah digunakan' }, { status: 400 })
  }
  if (invite.role !== 'client') {
    return NextResponse.json({ error: 'Link ini bukan untuk pendaftaran client' }, { status: 400 })
  }

  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: 'client' },
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  const userId = authData.user.id

  // Brand comes from the invite, never from the form -- Kuota, invoices and
  // live reports are all matched on this exact brand string, so letting the
  // client type it would silently break those joins on any typo.
  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: userId,
    full_name,
    role: 'client',
    client_brand: invite.client_brand,
    phone: phone || null,
    is_active: true,
  }, { onConflict: 'id' })

  if (profileErr) {
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  await supabase.from('onboarding_invites').update({
    status: 'completed',
    used_at: new Date().toISOString(),
    host_id: userId,
  }).eq('id', invite.id)

  return NextResponse.json({ success: true })
}
