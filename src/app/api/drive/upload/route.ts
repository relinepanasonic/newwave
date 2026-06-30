import { NextResponse } from 'next/server'
import { isDriveConfigured, uploadHostFile, uploadLiveReportFile } from '@/lib/gdrive'

export const runtime = 'nodejs'

// Body: { host_name, filename, mime, base64, report_date? }
// If report_date (YYYY-MM-DD) is provided, files go into:
//   [Host] / Live Report Detail / [Month Year] / filename
// Otherwise files go directly into [Host] / filename
export async function POST(req: Request) {
  if (!isDriveConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'drive_not_configured' })
  }

  try {
    const { host_name, filename, mime, base64, report_date } = await req.json()
    if (!host_name || !filename || !base64) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 })
    }

    const raw = base64.includes(',') ? base64.split(',')[1] : base64
    const buffer = Buffer.from(raw, 'base64')

    const result = report_date
      ? await uploadLiveReportFile({
          hostName: host_name,
          reportDate: report_date,
          filename,
          mimeType: mime || 'image/jpeg',
          buffer,
        })
      : await uploadHostFile({
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
