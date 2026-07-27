import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// Auth for external apps pushing/reading expense data: a single shared
// bearer token, same pattern as the existing Proone integration.
//   Authorization: Bearer <ACCOUNTING_API_KEY>
function checkAuth(req: Request): NextResponse | null {
  const key = process.env.ACCOUNTING_API_KEY
  if (!key) return NextResponse.json({ error: 'ACCOUNTING_API_KEY not configured on the server' }, { status: 500 })
  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${key}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

interface ExpensePayload {
  date: string              // YYYY-MM-DD, required
  category: string          // required
  amount: number            // required
  description?: string
  vendor?: string
  payment_method?: string
  brand?: string
  receipt_url?: string
  source: string             // required — identifies the pushing app, e.g. "proone"
  external_id?: string       // the source system's own id, for idempotent re-pushes
}

function validate(row: any): string | null {
  if (!row.date) return 'date is required (YYYY-MM-DD)'
  if (!row.category) return 'category is required'
  if (row.amount === undefined || row.amount === null || isNaN(Number(row.amount))) return 'amount is required and must be a number'
  if (!row.source) return 'source is required (identifies the pushing app)'
  return null
}

// POST body: a single expense object, or { expenses: [...] } for a batch push.
// Pushing the same (source, external_id) again updates the existing row instead
// of creating a duplicate — safe to retry on network failure.
export async function POST(req: Request) {
  const authErr = checkAuth(req)
  if (authErr) return authErr

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const rows: ExpensePayload[] = Array.isArray(body?.expenses) ? body.expenses : [body]
  if (rows.length === 0) return NextResponse.json({ error: 'No expense rows provided' }, { status: 400 })

  for (const row of rows) {
    const err = validate(row)
    if (err) return NextResponse.json({ error: err, row }, { status: 400 })
  }

  const supabase = admin()
  const toUpsert = rows.map(r => ({
    date: r.date, category: r.category, amount: Number(r.amount),
    description: r.description || null, vendor: r.vendor || null,
    payment_method: r.payment_method || null, brand: r.brand || null,
    receipt_url: r.receipt_url || null, source: r.source, external_id: r.external_id || null,
  }))

  // Rows with an external_id upsert on (source, external_id); rows without one
  // always insert fresh (no natural key to dedupe on).
  const withExternalId = toUpsert.filter(r => r.external_id)
  const withoutExternalId = toUpsert.filter(r => !r.external_id)

  const results: any[] = []
  if (withExternalId.length > 0) {
    const { data, error } = await supabase.from('expenses')
      .upsert(withExternalId, { onConflict: 'source,external_id' }).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    results.push(...(data || []))
  }
  if (withoutExternalId.length > 0) {
    const { data, error } = await supabase.from('expenses').insert(withoutExternalId).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    results.push(...(data || []))
  }

  return NextResponse.json({ success: true, count: results.length, expenses: results })
}

// GET ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&brand=...&source=...
// Lets a pushing app read back what's stored, e.g. to reconcile after a push.
export async function GET(req: Request) {
  const authErr = checkAuth(req)
  if (authErr) return authErr

  const { searchParams } = new URL(req.url)
  const supabase = admin()
  let q = supabase.from('expenses').select('*').order('date', { ascending: false })
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const brand = searchParams.get('brand')
  const source = searchParams.get('source')
  if (dateFrom) q = q.gte('date', dateFrom)
  if (dateTo) q = q.lte('date', dateTo)
  if (brand) q = q.eq('brand', brand)
  if (source) q = q.eq('source', source)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, count: data?.length || 0, expenses: data })
}

// DELETE ?id=<uuid>  or  ?source=...&external_id=...
export async function DELETE(req: Request) {
  const authErr = checkAuth(req)
  if (authErr) return authErr

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const source = searchParams.get('source')
  const externalId = searchParams.get('external_id')
  if (!id && !(source && externalId)) {
    return NextResponse.json({ error: 'Provide either id, or both source and external_id' }, { status: 400 })
  }

  const supabase = admin()
  let q = supabase.from('expenses').delete()
  q = id ? q.eq('id', id) : q.eq('source', source!).eq('external_id', externalId!)
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
