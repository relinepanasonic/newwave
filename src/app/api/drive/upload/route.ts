import { NextResponse } from 'next/server'
import { isDriveConfigured, uploadHostFile } from '@/lib/gdrive'

export const runtime = 'nodejs'

// Body: { host_name, filename, mime, base64 }  (base64 may be a full data: URL or raw)
export async function POST(req: Request) {
  if (!isDriveConfigured()) {
    // Not configured yet — non-fatal so the caller can keep working.
    return NextResponse.json({ skipped: true, reason: 'drive_not_configured' })
  }

  try {
    const { host_name, filename, mime, base64 } = await req.json()
    if (!host_name || !filename || !base64) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 })
    }

    const raw = base64.includes(',') ? base64.split(',')[1] : base64
    const buffer = Buffer.from(raw, 'base64')

    const result = await uploadHostFile({
      hostName: host_name,
      filename,
      mimeType: mime || 'image/jpeg',
      buffer,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Drive upload error' }, { status: 500 })
  }
}
