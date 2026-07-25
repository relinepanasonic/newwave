import { NextResponse } from 'next/server'
import { isDriveConfigured, uploadAbsensiPhoto } from '@/lib/gdrive'

export const runtime = 'nodejs'

// Body: { op_name, filename, mime, base64 }
// Files go into [Root] / Absensi Ops / [Operator Name] / filename
export async function POST(req: Request) {
  if (!isDriveConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'drive_not_configured' })
  }

  try {
    const { op_name, filename, mime, base64 } = await req.json()
    if (!op_name || !filename || !base64) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 })
    }

    const raw = base64.includes(',') ? base64.split(',')[1] : base64
    const buffer = Buffer.from(raw, 'base64')

    const result = await uploadAbsensiPhoto({
      opName: op_name,
      filename,
      mimeType: mime || 'image/jpeg',
      buffer,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Drive upload error' }, { status: 500 })
  }
}
