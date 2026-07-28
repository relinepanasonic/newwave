import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// Auth for external apps pushing/reading invoice data: a single shared
// bearer token, same pattern as the expenses push-in API.
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

interface InvoiceItemPayload {
  name: string
  description?: string
  scale?: string
  qty: number
  price: number
}

interface InvoicePayload {
  invoice_number: string    // required
  invoice_date?: string     // YYYY-MM-DD, defaults to today
  due_date?: string
  brand: string              // required
  invoice_to?: string
  discount_pct?: number
  ppn_pct?: number
  pph_pct?: number
  bank_name?: string
  bank_account_name?: string
  bank_account_number?: string
  notes?: string
  status?: string
  items?: InvoiceItemPayload[]
  source: string             // required — identifies the pushing app, e.g. "proone"
  external_id?: string        // the source system's own id, for idempotent re-pushes
}

function validate(row: any): string | null {
  if (!row.invoice_number) return 'invoice_number is required'
  if (!row.brand) return 'brand is required'
  if (!row.source) return 'source is required (identifies the pushing app)'
  return null
}

// Mirrors the totals math InvoicePanel.tsx uses for in-app invoices, so a
// pushed-in invoice lands with the same sub_total/total_amount semantics.
function computeTotals(items: InvoiceItemPayload[], discountPct: number, ppnPct: number) {
  const subTotal = items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.price || 0), 0)
  const discountAmt = Math.round(subTotal * (discountPct / 100))
  const afterDiscount = subTotal - discountAmt
  const ppnAmt = Math.round(afterDiscount * (ppnPct / 100))
  const totalAmount = afterDiscount + ppnAmt
  return { subTotal, totalAmount }
}

// POST body: a single invoice object (with nested `items`), or
// { invoices: [...] } for a batch push.
// Pushing the same (source, external_id) again updates the existing invoice
// (header + full item replace) instead of creating a duplicate.
export async function POST(req: Request) {
  const authErr = checkAuth(req)
  if (authErr) return authErr

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const rows: InvoicePayload[] = Array.isArray(body?.invoices) ? body.invoices : [body]
  if (rows.length === 0) return NextResponse.json({ error: 'No invoice rows provided' }, { status: 400 })

  for (const row of rows) {
    const err = validate(row)
    if (err) return NextResponse.json({ error: err, row }, { status: 400 })
  }

  const supabase = admin()
  const results: any[] = []

  for (const row of rows) {
    const items = row.items || []
    const discountPct = Number(row.discount_pct) || 0
    const ppnPct = Number(row.ppn_pct) || 0
    const { subTotal, totalAmount } = computeTotals(items, discountPct, ppnPct)

    const header = {
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date || new Date().toISOString().slice(0, 10),
      due_date: row.due_date || null,
      brand: row.brand,
      invoice_to: row.invoice_to || null,
      sub_total: subTotal,
      total_amount: totalAmount,
      bank_name: row.bank_name || 'Bank BCA',
      bank_account_name: row.bank_account_name || 'PT Pintu Langit Inovasi Global',
      bank_account_number: row.bank_account_number || '4295775788',
      notes: row.notes || null,
      status: row.status || 'unpaid',
      source: row.source,
      external_id: row.external_id || null,
    }

    const itemRows = items.map(i => ({
      name: i.name, description: i.description || null, scale: i.scale || 'pc',
      qty: Number(i.qty) || 0, price: Number(i.price) || 0,
      amount: Number(i.qty || 0) * Number(i.price || 0),
    }))

    let invoiceId: string | null = null

    if (row.external_id) {
      const { data: existing } = await supabase.from('invoices')
        .select('id').eq('source', row.source).eq('external_id', row.external_id).maybeSingle()
      if (existing) {
        const { data, error } = await supabase.from('invoices').update(header).eq('id', existing.id).select().single()
        if (error) return NextResponse.json({ error: error.message, row }, { status: 500 })
        invoiceId = data.id
        await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
      }
    }

    if (!invoiceId) {
      const { data, error } = await supabase.from('invoices').insert(header).select().single()
      if (error) return NextResponse.json({ error: error.message, row }, { status: 500 })
      invoiceId = data.id
    }

    if (itemRows.length > 0) {
      const { error: itemErr } = await supabase.from('invoice_items')
        .insert(itemRows.map(i => ({ ...i, invoice_id: invoiceId })))
      if (itemErr) return NextResponse.json({ error: itemErr.message, row }, { status: 500 })
    }

    const { data: full } = await supabase.from('invoices').select('*, invoice_items(*)').eq('id', invoiceId).single()
    results.push(full)
  }

  return NextResponse.json({ success: true, count: results.length, invoices: results })
}

// GET ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&brand=...&source=...&external_id=...
// Lets a pushing app read back what's stored, e.g. to reconcile after a push.
export async function GET(req: Request) {
  const authErr = checkAuth(req)
  if (authErr) return authErr

  const { searchParams } = new URL(req.url)
  const supabase = admin()
  let q = supabase.from('invoices').select('*, invoice_items(*)').order('invoice_date', { ascending: false })
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const brand = searchParams.get('brand')
  const source = searchParams.get('source')
  const externalId = searchParams.get('external_id')
  if (dateFrom) q = q.gte('invoice_date', dateFrom)
  if (dateTo) q = q.lte('invoice_date', dateTo)
  if (brand) q = q.eq('brand', brand)
  if (source) q = q.eq('source', source)
  if (externalId) q = q.eq('external_id', externalId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, count: data?.length || 0, invoices: data })
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
  let q = supabase.from('invoices').delete()
  q = id ? q.eq('id', id) : q.eq('source', source!).eq('external_id', externalId!)
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
