// Google Drive integration via OAuth2 refresh token (no extra npm deps).
//
// Why refresh-token OAuth instead of a service account?
// A service account uploading into a *personal* Gmail Drive folder fails with
// "Service Accounts do not have storage quota" — the file would be owned by the
// service account, which has zero quota. Using the owner's own refresh token,
// every uploaded file is owned by the user and counts against the user's Drive,
// so uploads into folder 16J8ZA8R0nc0IshWnJpKv1a0mhksZ44ji just work.
//
// Required env vars (see GDRIVE-SETUP.md):
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN
//   GDRIVE_ROOT_FOLDER_ID   (the HRD / "Apps New Wave" folder)

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export function isDriveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN &&
    process.env.GDRIVE_ROOT_FOLDER_ID
  )
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error('Drive auth failed: ' + (await res.text()))
  const json = await res.json()
  return json.access_token as string
}

// Folder/file names: strip characters that break the Drive search query or look bad.
export function sanitizeName(s: string): string {
  return (s || '')
    .replace(/[\\/]+/g, '-')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function findFolder(token: string, name: string, parent: string): Promise<string | null> {
  const q =
    `'${parent}' in parents and name = '${name.replace(/'/g, "\\'")}' ` +
    `and mimeType = '${FOLDER_MIME}' and trashed = false`
  const url =
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}` +
    `&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Drive folder lookup failed: ' + (await res.text()))
  const json = await res.json()
  return json.files?.[0]?.id || null
}

async function createFolder(token: string, name: string, parent: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files?fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
  })
  if (!res.ok) throw new Error('Drive folder create failed: ' + (await res.text()))
  const json = await res.json()
  return json.id as string
}

async function uploadMultipart(
  token: string, folderId: string, filename: string, mimeType: string, buffer: Buffer,
): Promise<string> {
  const boundary = '----nwboundary' + Date.now()
  const metadata = JSON.stringify({ name: filename, parents: [folderId] })
  const pre =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  const post = `\r\n--${boundary}--`
  const body = Buffer.concat([Buffer.from(pre, 'utf8'), buffer, Buffer.from(post, 'utf8')])

  const res = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  if (!res.ok) throw new Error('Drive upload failed: ' + (await res.text()))
  const json = await res.json()
  // webViewLink is the shareable "open in Drive" URL; file inherits the folder's sharing.
  return (json.webViewLink as string) || `https://drive.google.com/file/d/${json.id}/view`
}

/**
 * Ensure a folder named after the host exists directly under the root folder,
 * upload the given file into it, and return both the file link and folder link.
 * Reuses the host folder if it already exists.
 */
export async function uploadHostFile(opts: {
  hostName: string
  filename: string
  mimeType: string
  buffer: Buffer
}): Promise<{ fileUrl: string; folderUrl: string; folderId: string }> {
  const token = await getAccessToken()
  const root = process.env.GDRIVE_ROOT_FOLDER_ID!
  const folderName = sanitizeName(opts.hostName) || 'Tanpa Nama'

  let folderId = await findFolder(token, folderName, root)
  if (!folderId) folderId = await createFolder(token, folderName, root)

  const fileUrl = await uploadMultipart(
    token, folderId, sanitizeName(opts.filename), opts.mimeType, opts.buffer,
  )
  return {
    fileUrl,
    folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
    folderId,
  }
}
