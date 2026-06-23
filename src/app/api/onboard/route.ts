import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isDriveConfigured, uploadHostFile } from '@/lib/gdrive'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { token, full_name, alamat, nik_id, email, password, ktp_base64 } = await req.json()

  if (!token || !full_name || !email || !password) {
    return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 1. Validate token
  const { data: invite, error: inviteErr } = await admin
    .from('onboarding_invites')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .single()

  if (inviteErr || !invite) {
    return NextResponse.json({ error: 'Link tidak valid atau sudah digunakan' }, { status: 400 })
  }

  // 2. Create auth user
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: 'host' },
  })

  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 400 })
  }

  const userId = authData.user.id

  // 3. Upload KTP photo if provided — to Supabase Storage AND Google Drive
  let ktp_photo_url: string | null = null
  let gdrive_ktp_url: string | null = null
  let gdrive_folder_url: string | null = null
  if (ktp_base64) {
    const base64Data = ktp_base64.split(',')[1]
    const mimeMatch = ktp_base64.match(/data:([^;]+);/)
    const mime = mimeMatch?.[1] || 'image/jpeg'
    const ext = mime.split('/')[1] || 'jpg'
    const buffer = Buffer.from(base64Data, 'base64')

    // 3a. Supabase Storage (keeps the existing "Lihat" preview working)
    try {
      const path = `${userId}/ktp.${ext}`
      const { data: storageData, error: storageErr } = await admin.storage
        .from('ktp-photos')
        .upload(path, buffer, { contentType: mime, upsert: true })
      if (!storageErr && storageData) {
        const { data: urlData } = admin.storage.from('ktp-photos').getPublicUrl(storageData.path)
        ktp_photo_url = urlData.publicUrl
      }
    } catch {
      // Non-fatal
    }

    // 3b. Google Drive — create the host's named folder + drop the KTP in it
    if (isDriveConfigured()) {
      try {
        const drive = await uploadHostFile({
          hostName: full_name,
          filename: `KTP - ${full_name}.${ext}`,
          mimeType: mime,
          buffer,
        })
        gdrive_ktp_url = drive.fileUrl
        gdrive_folder_url = drive.folderUrl
      } catch {
        // Non-fatal — onboarding still succeeds without Drive
      }
    }
  }

  // 4. Upsert profile (create if not exists, update if exists)
  const { error: profileErr } = await admin.from('profiles').upsert({
    id: userId,
    full_name,
    role: 'host',
    alamat: alamat || null,
    nik_id: nik_id || null,
    ktp_photo_url,
    gdrive_ktp_url,
    gdrive_folder_url,
    tipe_host: invite.tipe_host,
    target_hours: invite.target_hours,
    hourly_rate: invite.hourly_rate,
    is_active: true,
  }, { onConflict: 'id' })

  if (profileErr) {
    // Rollback: delete the auth user so they can retry
    await admin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  // 5. Mark invite as completed
  await admin.from('onboarding_invites').update({
    status: 'completed',
    used_at: new Date().toISOString(),
    host_id: userId,
  }).eq('id', invite.id)

  return NextResponse.json({ success: true })
}
