import { NextResponse } from 'next/server'
import { isDriveConfigured, uploadHostFile } from '@/lib/gdrive'

export const runtime = 'nodejs'

export async function GET() {
  const configured = isDriveConfigured()
  if (!configured) {
    return NextResponse.json({
      ok: false,
      reason: 'Missing env vars',
      vars: {
        GOOGLE_OAUTH_CLIENT_ID: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
        GOOGLE_OAUTH_CLIENT_SECRET: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        GOOGLE_OAUTH_REFRESH_TOKEN: !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
        GDRIVE_ROOT_FOLDER_ID: !!process.env.GDRIVE_ROOT_FOLDER_ID,
      },
    })
  }

  try {
    const result = await uploadHostFile({
      hostName: 'TEST-NW',
      filename: 'test-connection.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('NW Schedule Drive test ' + new Date().toISOString()),
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) })
  }
}
