// One-off migration: push all existing New Wave invoices into ProOne Accounting.
//
// Run locally from the project root:
//   node scripts/migrate-invoices-to-proone.js --dry-run    (preview only, no POSTs)
//   node scripts/migrate-invoices-to-proone.js               (actually sends them)
//
// Requires these in .env.local (or exported in your shell):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY        (service role, so it can read auth.users for client emails)
//   PROONE_API_TOKEN                 the bearer token ProOne gave you for this integration
//                                    (same var name already set in Vercel -- Vercel's env vars
//                                    only apply to the deployed app, so it needs adding here too
//                                    for this script to see it locally)
//   PROONE_DOMAIN                    optional override; defaults to prooneaccounting.vercel.app
//                                    (the same host the app's existing Proone integration uses)
//
// What it does:
//   1. Loads every row from `invoices` + its `invoice_items`.
//   2. For each invoice's brand, looks up the matching client profile and their
//      auth email (profiles has no email column -- it only exists on auth.users).
//   3. Maps each invoice to ProOne's expected payload shape and POSTs it to
//      https://{PROONE_DOMAIN}/api/v1/integration/newwave/invoices
//   4. Prints a running progress line per invoice and a final success/fail summary.
//      Failures are also written to migrate-invoices-to-proone.failures.json so you
//      can inspect or retry just those without re-running everything.
//
// Safe to re-run: it doesn't track what it already sent, so if ProOne dedupes on
// its side (e.g. by invoice number) a second run is harmless; if it doesn't dedupe,
// re-running will create duplicates on the ProOne side. Check with them first if
// you need to re-run after a partial failure.

const fs = require('fs')
const path = require('path')

// ── Load .env.local manually (same lightweight approach used elsewhere in this
// repo's ad-hoc scripts -- avoids adding a dotenv dependency for a one-off file).
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  })
}
loadEnvLocal()

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROONE_DOMAIN = process.env.PROONE_DOMAIN || 'prooneaccounting.vercel.app'
const PROONE_TOKEN = process.env.PROONE_API_TOKEN

const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (check .env.local).')
  process.exit(1)
}
if (!DRY_RUN && !PROONE_TOKEN) {
  console.error('Missing PROONE_API_TOKEN. Add it to .env.local (same value as the Vercel env var of the same name), or run with --dry-run to preview without sending.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// quantity x unitPrice must equal the item's real line total. New Wave's own
// amount = qty * jam_per_sesi * price, but ProOne's shape only has quantity and
// unitPrice -- so unitPrice folds jam_per_sesi in, keeping quantity = qty and
// the resulting total (quantity * unitPrice) equal to what New Wave actually billed.
function mapItem(item) {
  const unitPrice = item.is_free ? 0 : Math.round(Number(item.jam_per_sesi || 0) * Number(item.price || 0))
  return {
    description: item.description ? `${item.name} — ${item.description}` : item.name,
    quantity: Number(item.qty) || 1,
    unitPrice,
  }
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (no requests will be sent) ===' : '=== LIVE RUN ===')

  console.log('Fetching invoices...')
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .order('invoice_date')
  if (invErr) { console.error('Failed to fetch invoices:', invErr.message); process.exit(1) }
  console.log(`Found ${invoices.length} invoices.`)

  console.log('Fetching client profiles...')
  const { data: clients, error: clientErr } = await supabase
    .from('profiles')
    .select('id, full_name, client_brand')
    .eq('role', 'client')
    .not('client_brand', 'is', null)
  if (clientErr) { console.error('Failed to fetch client profiles:', clientErr.message); process.exit(1) }

  const clientByBrand = {}
  clients.forEach(c => { clientByBrand[c.client_brand] = c })

  // Auth emails aren't on the profiles table -- fetch each unique client's
  // email once via the admin API and cache it.
  const emailByProfileId = {}
  async function getEmail(profileId) {
    if (!profileId) return null
    if (profileId in emailByProfileId) return emailByProfileId[profileId]
    const { data, error } = await supabase.auth.admin.getUserById(profileId)
    const email = error ? null : (data?.user?.email || null)
    emailByProfileId[profileId] = email
    return email
  }

  let sent = 0
  let failed = 0
  const failures = []

  for (const inv of invoices) {
    const client = clientByBrand[inv.brand]
    const clientEmail = await getEmail(client?.id)
    const dueDate = inv.due_date || addDays(inv.invoice_date, 14)

    const payload = {
      clientName: inv.brand,
      clientEmail: clientEmail || undefined,
      contactName: inv.invoice_to || client?.full_name || '',
      issueDate: inv.invoice_date,
      dueDate,
      items: (inv.invoice_items || []).map(mapItem),
    }

    if (payload.items.length === 0) {
      console.log(`⚠ Skipping ${inv.invoice_number} — no line items`)
      continue
    }

    if (DRY_RUN) {
      console.log(`[dry-run] ${inv.invoice_number} → ${JSON.stringify(payload)}`)
      sent++
      continue
    }

    try {
      const res = await fetch(`https://${PROONE_DOMAIN}/api/v1/integration/newwave/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${PROONE_TOKEN}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${text}`)
      }

      console.log(`✓ ${inv.invoice_number} sent`)
      sent++
    } catch (err) {
      console.error(`✗ ${inv.invoice_number} failed:`, err.message)
      failed++
      failures.push({ invoice_number: inv.invoice_number, invoice_id: inv.id, error: err.message, payload })
    }
  }

  console.log('\n=== Summary ===')
  console.log(`Total invoices: ${invoices.length}`)
  console.log(`Sent: ${sent}`)
  console.log(`Failed: ${failed}`)

  if (failures.length > 0) {
    const outPath = path.join(__dirname, 'migrate-invoices-to-proone.failures.json')
    fs.writeFileSync(outPath, JSON.stringify(failures, null, 2))
    console.log(`Failure details written to ${outPath}`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
