import { NextResponse } from 'next/server'
import { isDriveConfigured, uploadPettyCashReceipt } from '@/lib/gdrive'

export const runtime = 'nodejs'

// Body: { host_name, cash_id, filename, mime, base64 }
export async function POST(req: Request) {
  if (!isDriveConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'drive_not_configured' })
  }
  try {
    const { host_name, cash_id, filename, mime, base64 } = await req.json()
    if (!host_name || !cash_id || !filename || !base64) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 })
    }
    const raw = base64.includes(',') ? base64.split(',')[1] : base64
    const buffer = Buffer.from(raw, 'base64')
    const result = await uploadPettyCashReceipt({
      hostName: host_name, cashId: cash_id,
      filename, mimeType: mime || 'image/jpeg', buffer,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload error' }, { status: 500 })
  }
}
