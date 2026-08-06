'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Save, ChevronDown, ChevronUp, FileText, CheckCircle, Pencil, Trash2, Printer, Copy, Check } from 'lucide-react'
import { printInvoice } from './printInvoice'
import CurrencyInput from '@/components/CurrencyInput'

const PROONE_URL = process.env.NEXT_PUBLIC_PROONE_API_URL ?? 'https://prooneaccounting.vercel.app/api/v1'
const PROONE_KEY = process.env.NEXT_PUBLIC_PROONE_API_KEY ?? ''

// Pushes a New Wave-authored invoice (create OR edit -- ProOne is expected to
// upsert on external_id the same way our own /api/accounting/invoices does)
// to ProOne. Only call this for invoices New Wave itself owns (source !==
// 'proone') -- pushing a ProOne-sourced invoice back would create a loop.
async function syncInvoiceToProone(
  invoiceId: string,
  invoiceNumber: string,
  invoiceDate: string,
  clientName: string,
  items: { name: string; description: string; amount: number }[]
) {
  if (!PROONE_KEY) return
  try {
    await fetch(`${PROONE_URL}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PROONE_KEY}` },
      body: JSON.stringify({
        invoice_number: invoiceNumber,
        due_date: invoiceDate,
        client_name: clientName || 'New Wave Client',
        source: 'new-wave',
        external_id: invoiceId,
        items: items.filter(i => i.name.trim()).map(i => ({
          description: i.name + (i.description ? ` — ${i.description}` : ''),
          quantity: 1,
          unit_price: i.amount,
        })),
      }),
    })
  } catch { /* non-blocking */ }
}

// Tells ProOne a New Wave-authored invoice was deleted, keyed the same way
// (source + external_id) as the push-in/push-out create-or-update calls.
async function syncInvoiceDeleteToProone(invoiceId: string) {
  if (!PROONE_KEY) return
  try {
    await fetch(`${PROONE_URL}/invoices?source=new-wave&external_id=${invoiceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${PROONE_KEY}` },
    })
  } catch { /* non-blocking */ }
}

const SCALES = ['pc', 'month', 'hour', 'day']

// Bank accounts offered in the invoice form's "Bank Payment Account Option"
// dropdown. Add more entries here as New Wave opens new accounts.
const BANK_ACCOUNTS = [
  { bank_name: 'Bank BCA', bank_account_number: '4295775788', bank_account_name: 'PT Pintu Langit Inovasi Global' },
]

function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

interface ClientProfile { id: string; full_name: string; client_brand: string }

interface InvoiceItem {
  id?: string
  name: string
  description: string
  scale: string
  qty: number
  price: number
  amount: number
}

interface Invoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  brand: string
  invoice_to: string
  sub_total: number
  discount_pct: number
  ppn_pct: number
  pph_pct: number
  total_amount: number
  bank_name: string
  bank_account_name: string
  bank_account_number: string
  notes: string
  status: string
  created_at: string
  source?: string
  external_id?: string | null
  invoice_items?: InvoiceItem[]
}

const EMPTY_ITEM: InvoiceItem = {
  name: '', description: '', scale: 'pc', qty: 1, price: 0, amount: 0,
}

// Generate next invoice number: NW{YY}{MM}{SEQ}
// e.g. NW2607001. Scans existing numbers for same year+month prefix to find next seq.
function nextInvoiceNumber(date: string, existing: string[]): string {
  const d = new Date(date + 'T00:00:00')
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const prefix = `NW${yy}${mm}`
  const seqs = existing
    .filter(n => n.startsWith(prefix))
    .map(n => parseInt(n.slice(prefix.length), 10))
    .filter(n => !isNaN(n))
  const max = seqs.length ? Math.max(...seqs) : 0
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const FORM_DEFAULT = {
  invoice_number: '', invoice_date: new Date().toISOString().slice(0, 10),
  due_date: addDays(new Date().toISOString().slice(0, 10), 15),
  brand: '', invoice_to: '', discount_pct: 0, ppn_pct: 0, pph_pct: 0,
  bank_name: BANK_ACCOUNTS[0].bank_name, bank_account_name: BANK_ACCOUNTS[0].bank_account_name,
  bank_account_number: BANK_ACCOUNTS[0].bank_account_number, notes: '',
}

// Status is mirrored verbatim from whichever source created the invoice --
// New Wave's own form still writes 'unpaid'/'paid'/'cancelled', but a
// ProOne-pushed invoice can carry ProOne's own vocabulary (draft, pending,
// overdue, ...). Known values get a styled badge; anything else still shows
// (title-cased) via statusConfigFor's fallback instead of being hidden.
const STATUS_CONFIG: Record<string, { label: string; badge: string; border: string }> = {
  unpaid:    { label: 'Billed',  badge: 'bg-amber-100 text-amber-700',   border: 'border-l-amber-400' },
  pending:   { label: 'Pending', badge: 'bg-amber-100 text-amber-700',   border: 'border-l-amber-400' },
  draft:     { label: 'Draft',   badge: 'bg-gray-100 text-gray-500',     border: 'border-l-gray-300' },
  overdue:   { label: 'Overdue', badge: 'bg-red-100 text-red-700',       border: 'border-l-red-400' },
  paid:      { label: 'Paid',    badge: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-400' },
  cancelled: { label: 'Close',   badge: 'bg-gray-100 text-gray-500',     border: 'border-l-gray-300' },
}
function statusConfigFor(status: string) {
  return STATUS_CONFIG[status] || {
    label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Billed',
    badge: 'bg-gray-100 text-gray-500', border: 'border-l-gray-300',
  }
}

interface NwPackage { id: string; name: string; description: string | null; tipe_live: string; jam_per_sesi: number; price_per_jam: number; is_active: boolean }

export default function InvoicePanel({ profile }: { profile: any }) {
  const isSuperadmin = profile.role === 'superadmin'
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<ClientProfile[]>([])
  const [nwPackages, setNwPackages] = useState<NwPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showApiInfo, setShowApiInfo] = useState(false)
  const [copied, setCopied] = useState(false)

  // Invoice list filters
  const [monthFilter, setMonthFilter] = useState('all')      // invoice_date's YYYY-MM
  const [clientFilter, setClientFilter] = useState('all')    // brand
  const [dueMonthFilter, setDueMonthFilter] = useState('all') // due_date's YYYY-MM
  const [statusFilter, setStatusFilter] = useState('all')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [form, setForm] = useState({ ...FORM_DEFAULT })
  const [items, setItems] = useState<InvoiceItem[]>([{ ...EMPTY_ITEM }])
  // Net-15: due date auto-snaps to 15 days after issue date, unless the user
  // has manually edited it themselves (tracked here so a later issue-date
  // change doesn't stomp their override).
  const [dueDateTouched, setDueDateTouched] = useState(false)

  const clientBrand = profile.client_brand

  useEffect(() => {
    const supabase = createClient()
    const invoiceQ = supabase.from('invoices').select('*, invoice_items(*)').order('invoice_date', { ascending: false })
      .then(({ data }) => data || [])
    const clientQ = isSuperadmin
      ? supabase.from('profiles').select('id, full_name, client_brand').eq('role', 'client').not('client_brand', 'is', null)
          .then(({ data }) => (data || []) as ClientProfile[])
      : Promise.resolve([] as ClientProfile[])

    const pkgQ = supabase.from('nw_packages').select('*').eq('is_active', true).order('sort_order').order('name')
      .then(({ data }) => (data || []) as NwPackage[])

    Promise.all([invoiceQ, clientQ, pkgQ] as const).then(([invData, clientData, pkgData]) => {
      let filtered = invData as Invoice[]
      if (!isSuperadmin && clientBrand) filtered = filtered.filter((inv: Invoice) => inv.brand === clientBrand)
      setInvoices(filtered)
      if (clientData) setClients(clientData as ClientProfile[])
      setNwPackages(pkgData)
      setLoading(false)
    })
  }, [isSuperadmin, clientBrand])

  function handleBrandChange(brand: string) {
    const client = clients.find(c => c.client_brand === brand)
    setForm(f => ({ ...f, brand, invoice_to: client?.full_name || f.invoice_to }))
  }

  function updateItem(idx: number, field: keyof InvoiceItem, value: any) {
    setItems(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      if (field === 'qty' || field === 'price') {
        const item = next[idx]
        next[idx].amount = Number(item.qty) * Number(item.price)
      }
      return next
    })
  }

  const subTotal = items.reduce((s, i) => s + (i.amount || 0), 0)
  const discountAmt = Math.round(subTotal * (form.discount_pct / 100))
  const afterDiscount = subTotal - discountAmt
  const ppnAmt = Math.round(afterDiscount * (form.ppn_pct / 100))
  const totalAmount = afterDiscount + ppnAmt
  const pphAmt = Math.round(totalAmount * (form.pph_pct / 100))
  const realTotal = totalAmount - pphAmt

  function startEdit(inv: Invoice) {
    setEditingId(inv.id)
    setForm({
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date || addDays(inv.invoice_date, 15),
      brand: inv.brand,
      invoice_to: inv.invoice_to || '',
      discount_pct: inv.discount_pct,
      ppn_pct: inv.ppn_pct,
      pph_pct: inv.pph_pct ?? 0,
      bank_name: inv.bank_name || BANK_ACCOUNTS[0].bank_name,
      bank_account_name: inv.bank_account_name || BANK_ACCOUNTS[0].bank_account_name,
      bank_account_number: inv.bank_account_number || BANK_ACCOUNTS[0].bank_account_number,
      notes: inv.notes || '',
    })
    setItems(inv.invoice_items?.map(i => ({
      name: i.name, description: i.description || '',
      scale: i.scale || 'pc', qty: i.qty, price: i.price, amount: i.amount,
    })) || [{ ...EMPTY_ITEM }])
    setDueDateTouched(true) // editing an existing invoice keeps its own due date
    setShowCreate(true)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelForm() {
    setShowCreate(false)
    setEditingId(null)
    setForm({ ...FORM_DEFAULT })
    setItems([{ ...EMPTY_ITEM }])
    setDueDateTouched(false)
    setError('')
  }

  async function handleSave() {
    if (!form.invoice_number || !form.brand) { setError('Nomor invoice dan brand wajib diisi'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const payload = {
      ...form,
      due_date: form.due_date || null,
      discount_pct: Number(form.discount_pct),
      ppn_pct: Number(form.ppn_pct),
      pph_pct: Number(form.pph_pct),
      sub_total: subTotal,
      total_amount: totalAmount,
    }
    const itemsToInsert = items.filter(i => i.name.trim()).map(i => ({
      name: i.name, description: i.description, scale: i.scale,
      qty: Number(i.qty), price: Number(i.price), amount: Number(i.amount),
    }))

    if (editingId) {
      const { error: updErr } = await supabase.from('invoices').update(payload).eq('id', editingId)
      if (updErr) { setError(updErr.message); setSaving(false); return }
      await supabase.from('invoice_items').delete().eq('invoice_id', editingId)
      if (itemsToInsert.length > 0)
        await supabase.from('invoice_items').insert(itemsToInsert.map(i => ({ ...i, invoice_id: editingId })))
      setInvoices(prev => prev.map(inv => inv.id === editingId
        ? { ...inv, ...payload, invoice_items: itemsToInsert } : inv))
      const editedInv = invoices.find(inv => inv.id === editingId)
      if (!editedInv || editedInv.source !== 'proone')
        syncInvoiceToProone(editingId, form.invoice_number, form.invoice_date, form.brand || form.invoice_to, items)
      cancelForm()
    } else {
      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        ...payload, created_by: profile.id, status: 'unpaid',
      }).select().single()
      if (invErr || !inv) { setError(invErr?.message || 'Gagal menyimpan'); setSaving(false); return }
      if (itemsToInsert.length > 0)
        await supabase.from('invoice_items').insert(itemsToInsert.map(i => ({ ...i, invoice_id: inv.id })))
      setInvoices(prev => [{ ...inv, invoice_items: itemsToInsert } as Invoice, ...prev])
      syncInvoiceToProone(inv.id, form.invoice_number, form.invoice_date, form.brand || form.invoice_to, items)
      cancelForm()
    }
    setSaving(false)
  }

  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  async function duplicateInvoice(inv: Invoice) {
    setDuplicatingId(inv.id)
    const supabase = createClient()
    const today = new Date().toISOString().slice(0, 10)
    const payload = {
      invoice_number: nextInvoiceNumber(today, invoices.map(i => i.invoice_number)),
      invoice_date: today,
      due_date: addDays(today, 15),
      brand: inv.brand, invoice_to: inv.invoice_to,
      discount_pct: inv.discount_pct, ppn_pct: inv.ppn_pct, pph_pct: inv.pph_pct ?? 0,
      sub_total: inv.sub_total, total_amount: inv.total_amount,
      bank_name: inv.bank_name, bank_account_name: inv.bank_account_name, bank_account_number: inv.bank_account_number,
      notes: inv.notes, created_by: profile.id, status: 'unpaid',
    }
    const { data: newInv, error } = await supabase.from('invoices').insert(payload).select().single()
    if (!error && newInv) {
      const itemsToInsert = (inv.invoice_items || []).map(i => ({
        name: i.name, description: i.description, scale: i.scale,
        qty: i.qty, price: i.price, amount: i.amount,
        invoice_id: newInv.id,
      }))
      if (itemsToInsert.length > 0) await supabase.from('invoice_items').insert(itemsToInsert)
      setInvoices(prev => [{ ...newInv, invoice_items: itemsToInsert } as Invoice, ...prev])
    }
    setDuplicatingId(null)
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    const deletedInv = invoices.find(inv => inv.id === id)
    await createClient().from('invoices').delete().eq('id', id)
    setInvoices(prev => prev.filter(inv => inv.id !== id))
    setConfirmDeleteId(null)
    setDeleting(false)
    if (!deletedInv || deletedInv.source !== 'proone') syncInvoiceDeleteToProone(id)
  }

  async function markPaid(id: string) {
    await createClient().from('invoices').update({ status: 'paid' }).eq('id', id)
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'paid' } : inv))
  }

  function calcPph(inv: Invoice) { return Math.round(inv.total_amount * ((inv.pph_pct ?? 0) / 100)) }

  const apiSample = `curl -X POST https://app.newwave.id/api/accounting/invoices \\
  -H "Authorization: Bearer <ACCOUNTING_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "invoice_number": "PRO-2607001",
    "invoice_date": "2026-07-28",
    "due_date": "2026-08-11",
    "brand": "Niko Electronic",
    "invoice_to": "Niko Electronic",
    "items": [
      { "name": "Silver Package", "description": "8 sesi live", "qty": 8, "price": 750000, "scale": "pc" }
    ],
    "source": "proone",
    "external_id": "proone-inv-1029"
  }'`

  // Selected bank account row, matched against the form's current
  // bank_* triple (falls back to showing that triple as its own option if it
  // doesn't match a configured account, e.g. from an older invoice).
  const selectedBankIdx = BANK_ACCOUNTS.findIndex(b =>
    b.bank_name === form.bank_name && b.bank_account_number === form.bank_account_number && b.bank_account_name === form.bank_account_name)

  const createForm = showCreate && isSuperadmin && (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"
        style={{ background: 'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)' }}>
        <div>
          <h2 className="font-bold text-brand-900 text-sm">
            {editingId ? `Edit Invoice — ${form.invoice_number}` : 'Buat Invoice Baru'}
          </h2>
          <p className="text-[10px] text-brand-500 mt-0.5">
            {editingId ? 'Perbarui data invoice & item layanan' : 'Isi detail invoice dan item layanan'}
          </p>
        </div>
        <button onClick={cancelForm} className="p-1.5 rounded-lg hover:bg-brand-100 transition-colors">
          <X size={16} className="text-brand-400"/>
        </button>
      </div>
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Brand *</label>
            <select value={form.brand} onChange={e => handleBrandChange(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
              <option value="">— Pilih Brand —</option>
              {clients.map(c => <option key={c.id} value={c.client_brand}>{c.client_brand}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              No. Invoice {!editingId && <span className="text-brand-400 normal-case">(otomatis)</span>}
            </label>
            <input value={form.invoice_number} readOnly={!editingId}
              onChange={e => editingId && setForm(f => ({ ...f, invoice_number: e.target.value }))}
              className={`w-full border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none transition-shadow ${
                !editingId
                  ? 'border-brand-200 bg-brand-50 text-brand-700 font-bold cursor-default'
                  : 'border-gray-200 focus:ring-2 focus:ring-brand-400'
              }`}/>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Tanggal</label>
            <input type="date" value={form.invoice_date} onChange={e => {
              const newDate = e.target.value
              setForm(f => ({
                ...f,
                invoice_date: newDate,
                // Re-generate number on a new invoice (not when editing); due
                // date auto-snaps to Net-15 unless the user already overrode it.
                ...(!editingId ? { invoice_number: nextInvoiceNumber(newDate, invoices.map(i => i.invoice_number)) } : {}),
                ...(!dueDateTouched ? { due_date: addDays(newDate, 15) } : {}),
              }))
            }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Due Date (Net-15)</label>
            <input type="date" value={form.due_date}
              onChange={e => { setDueDateTouched(true); setForm(f => ({ ...f, due_date: e.target.value })) }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Invoice To</label>
            <input value={form.invoice_to} onChange={e => setForm(f => ({ ...f, invoice_to: e.target.value }))}
              placeholder="Otomatis dari client"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Item Layanan</label>
            <button type="button" onClick={() => setItems(p => [...p, { ...EMPTY_ITEM }])}
              className="flex items-center gap-1.5 text-xs text-brand-600 font-semibold hover:text-brand-700 transition-colors">
              <Plus size={12}/> Tambah Item
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="bg-gray-50/70 rounded-xl border border-gray-100 p-3 space-y-2.5">
                {/* Auto-fill from catalog shortcut */}
                {nwPackages.length > 0 && (
                  <select defaultValue=""
                    onChange={e => {
                      const pkg = nwPackages.find(p => p.id === e.target.value)
                      if (!pkg) return
                      setItems(prev => {
                        const next = [...prev]
                        const unitPrice = pkg.jam_per_sesi * pkg.price_per_jam
                        next[idx] = { ...next[idx], name: pkg.name, price: unitPrice,
                          description: pkg.description || '', amount: next[idx].qty * unitPrice }
                        return next
                      })
                      e.target.value = ''
                    }}
                    className="w-full border border-brand-200 bg-brand-50 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400">
                    <option value="">⚡ Auto-fill dari katalog...</option>
                    {nwPackages.map(p => (
                      <option key={p.id} value={p.id}>{p.name} · {p.tipe_live} · {fmtRp(p.jam_per_sesi * p.price_per_jam)}</option>
                    ))}
                  </select>
                )}
                <div className="flex items-start gap-2">
                  <input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)}
                    placeholder="Nama Paket (mis. Silver Package)"
                    className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                  {items.length > 1 && (
                    <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))}
                      className="p-2 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={13}/>
                    </button>
                  )}
                </div>
                <textarea value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                  rows={3} placeholder={'* 3 bulan kontrak\n* 50 jam 1 Bulan (25 Hari)\n* Regular Host'}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white resize-y"/>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold mb-1 block">QTY</label>
                    <input type="number" min="0" value={item.qty}
                      onChange={e => updateItem(idx, 'qty', parseInt(e.target.value) || 0)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold mb-1 block">Scale</label>
                    <select value={item.scale} onChange={e => updateItem(idx, 'scale', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white">
                      {SCALES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold mb-1 block">Price</label>
                    <CurrencyInput value={item.price} onChange={v => updateItem(idx, 'price', v)}
                      className="flex-1 min-w-0 w-0 px-1.5 py-2 text-xs focus:outline-none"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold mb-1 block">Total</label>
                    <div className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-gray-50 font-bold text-gray-700 text-right">
                      {fmtRp(item.amount)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Diskon (%)</label>
              <input type="number" min="0" max="100" value={form.discount_pct}
                onChange={e => setForm(f => ({ ...f, discount_pct: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"/>
            </div>
            <div>
              <label className="flex items-center gap-1.5 cursor-pointer mb-1.5">
                <input type="checkbox" checked={form.ppn_pct > 0}
                  onChange={e => setForm(f => ({ ...f, ppn_pct: e.target.checked ? 11 : 0 }))}
                  className="rounded accent-brand-600"/>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">PPN (%)</span>
              </label>
              <input type="number" min="0" max="100" value={form.ppn_pct}
                onChange={e => setForm(f => ({ ...f, ppn_pct: parseFloat(e.target.value) || 0 }))}
                disabled={form.ppn_pct === 0}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white disabled:bg-gray-100 disabled:text-gray-300"/>
            </div>
            <div>
              <label className="flex items-center gap-1.5 cursor-pointer mb-1.5">
                <input type="checkbox" checked={form.pph_pct > 0}
                  onChange={e => setForm(f => ({ ...f, pph_pct: e.target.checked ? 2 : 0 }))}
                  className="rounded accent-brand-600"/>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">PPH (%)</span>
              </label>
              <input type="number" min="0" max="100" value={form.pph_pct}
                onChange={e => setForm(f => ({ ...f, pph_pct: parseFloat(e.target.value) || 0 }))}
                disabled={form.pph_pct === 0}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white disabled:bg-gray-100 disabled:text-gray-300"/>
            </div>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-500"><span>Sub Total</span><span className="font-medium text-gray-700">{fmtRp(subTotal)}</span></div>
            {discountAmt > 0 && <div className="flex justify-between text-gray-500"><span>Diskon {form.discount_pct}%</span><span className="font-medium text-red-500">− {fmtRp(discountAmt)}</span></div>}
            <div className="flex justify-between text-gray-500"><span>PPN {form.ppn_pct}%</span><span className="font-medium text-gray-700">+ {fmtRp(ppnAmt)}</span></div>
            <div className="flex justify-between font-bold text-brand-700 text-base pt-2 border-t border-gray-200 mt-2">
              <span>Total Invoice</span><span>{fmtRp(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>PPH {form.pph_pct}% (dipotong client)</span>
              <span className="text-red-400">− {fmtRp(pphAmt)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-emerald-700 pt-1.5 border-t border-dashed border-gray-200">
              <span>Total Diterima</span><span>{fmtRp(realTotal)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Bank Payment Account</label>
            <select value={selectedBankIdx}
              onChange={e => {
                const b = BANK_ACCOUNTS[Number(e.target.value)]
                if (!b) return
                setForm(f => ({ ...f, bank_name: b.bank_name, bank_account_name: b.bank_account_name, bank_account_number: b.bank_account_number }))
              }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
              {selectedBankIdx === -1 && (
                <option value={-1}>{form.bank_name} | {form.bank_account_number} | {form.bank_account_name}</option>
              )}
              {BANK_ACCOUNTS.map((b, i) => (
                <option key={i} value={i}>{b.bank_name} | {b.bank_account_number} | {b.bank_account_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Catatan</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={1} placeholder="For any question please contact us"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"/>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <X size={14} className="text-red-500 flex-shrink-0"/>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-2.5">
          <button onClick={cancelForm} className="px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-brand-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors shadow-sm">
            <Save size={14}/> {saving ? 'Menyimpan...' : editingId ? 'Perbarui Invoice' : 'Simpan Invoice'}
          </button>
        </div>
      </div>
    </div>
  )

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  }
  const monthOptions = useMemo(() =>
    Array.from(new Set(invoices.map(i => i.invoice_date.slice(0, 7)))).sort(),
    [invoices])
  const dueMonthOptions = useMemo(() =>
    Array.from(new Set(invoices.filter(i => i.due_date).map(i => i.due_date!.slice(0, 7)))).sort(),
    [invoices])
  const clientOptions = useMemo(() =>
    Array.from(new Set(invoices.map(i => i.brand).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [invoices])
  // Built from whatever status values are actually present (not a fixed
  // enum) so a status ProOne introduces later still shows up as a filter.
  const statusOptions = useMemo(() =>
    Array.from(new Set(invoices.map(i => i.status).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [invoices])
  const filteredInvoices = useMemo(() => invoices.filter(inv =>
    (monthFilter === 'all' || inv.invoice_date.slice(0, 7) === monthFilter) &&
    (clientFilter === 'all' || inv.brand === clientFilter) &&
    (dueMonthFilter === 'all' || inv.due_date?.slice(0, 7) === dueMonthFilter) &&
    (statusFilter === 'all' || inv.status === statusFilter)
  ), [invoices, monthFilter, clientFilter, dueMonthFilter, statusFilter])

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Invoice</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isSuperadmin
              ? (filteredInvoices.length === invoices.length
                  ? `${invoices.length} invoice terdaftar`
                  : `${filteredInvoices.length} dari ${invoices.length} invoice`)
              : `Invoice untuk brand ${clientBrand}`}
          </p>
        </div>
        {isSuperadmin && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowApiInfo(s => !s)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-600 hover:bg-gray-50 transition-colors">
              API
            </button>
            {!showCreate && (
              <button onClick={() => {
                const today = new Date().toISOString().slice(0, 10)
                const num = nextInvoiceNumber(today, invoices.map(i => i.invoice_number))
                setForm(f => ({ ...f, invoice_date: today, invoice_number: num, due_date: addDays(today, 15) }))
                setDueDateTouched(false)
                setShowCreate(true)
              }}
                className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm">
                <Plus size={15}/> Buat Invoice
              </button>
            )}
          </div>
        )}
      </div>

      {showApiInfo && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-sm font-bold text-gray-900">Push Invoice via API (ProOne ↔ New Wave)</p>
          <p className="text-xs text-gray-500">
            New Wave otomatis push invoice yang dibuat di sini ke ProOne. Untuk arah sebaliknya, endpoint ini menerima push dari ProOne (atau aplikasi lain). Butuh env var <code className="bg-gray-100 px-1 py-0.5 rounded text-[11px]">ACCOUNTING_API_KEY</code> di server.
            Kirim <code className="bg-gray-100 px-1 py-0.5 rounded text-[11px]">source</code> + <code className="bg-gray-100 px-1 py-0.5 rounded text-[11px]">external_id</code> supaya push ulang tidak duplikat (upsert otomatis).
            Bisa juga kirim banyak sekaligus lewat <code className="bg-gray-100 px-1 py-0.5 rounded text-[11px]">{'{ "invoices": [...] }'}</code>.
          </p>
          <div className="relative">
            <pre className="bg-gray-900 text-gray-100 text-[11px] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">{apiSample}</pre>
            <button onClick={() => { navigator.clipboard.writeText(apiSample); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
              {copied ? <Check size={12} className="text-emerald-400"/> : <Copy size={12}/>}
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            GET dan DELETE tersedia di endpoint yang sama (dengan Authorization header yang sama) untuk baca-balik atau hapus data yang sudah dipush.
          </p>
        </div>
      )}

      {!loading && invoices.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
            <option value="all">Semua Bulan (Dibuat)</option>
            {monthOptions.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
          </select>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
            <option value="all">Semua Client</option>
            {clientOptions.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={dueMonthFilter} onChange={e => setDueMonthFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
            <option value="all">Semua Due Date</option>
            {dueMonthOptions.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
            <option value="all">Semua Status</option>
            {statusOptions.map(s => <option key={s} value={s}>{statusConfigFor(s).label}</option>)}
          </select>
          {(monthFilter !== 'all' || clientFilter !== 'all' || dueMonthFilter !== 'all' || statusFilter !== 'all') && (
            <button onClick={() => { setMonthFilter('all'); setClientFilter('all'); setDueMonthFilter('all'); setStatusFilter('all') }}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors">
              Reset Filter
            </button>
          )}
        </div>
      )}

      {createForm}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 h-20 animate-pulse"/>
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <FileText size={32} className="text-gray-200 mx-auto mb-3"/>
          <p className="text-sm font-medium text-gray-400">Belum ada invoice</p>
          <p className="text-xs text-gray-300 mt-1">Invoice yang dibuat akan muncul di sini</p>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <FileText size={32} className="text-gray-200 mx-auto mb-3"/>
          <p className="text-sm font-medium text-gray-400">Tidak ada invoice yang cocok dengan filter</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">No. Invoice</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Tanggal</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Client</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Due Date</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Package</th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Amount Billed</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Status</th>
                  <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredInvoices.map(inv => {
                  const isExpanded = expandedId === inv.id
                  const invPphAmt = calcPph(inv)
                  const invRealTotal = inv.total_amount - invPphAmt
                  const st = statusConfigFor(inv.status)
                  const isConfirmDelete = confirmDeleteId === inv.id
                  const packageNames = (inv.invoice_items || []).map(i => i.name).filter(Boolean)
                  const packageLabel = packageNames.length === 0 ? '—'
                    : packageNames.length === 1 ? packageNames[0]
                    : `${packageNames[0]} +${packageNames.length - 1} lainnya`

                  return (
                    <>
                      <tr key={inv.id} onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`inline-block w-1 h-4 rounded-full align-middle mr-2 ${st.border.replace('border-l-', 'bg-')}`}/>
                          <span className="font-bold text-gray-900 text-xs align-middle">{inv.invoice_number}</span>
                          {inv.source && inv.source !== 'newwave' && (
                            <span className="ml-1.5 text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold align-middle whitespace-nowrap">
                              via {inv.source}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600">
                          {new Date(inv.invoice_date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-3 py-3 max-w-[180px]">
                          <p className="text-xs font-semibold text-gray-800 truncate">{inv.brand}</p>
                          {inv.invoice_to && <p className="text-[11px] text-gray-400 truncate">{inv.invoice_to}</p>}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600">
                          {inv.due_date
                            ? new Date(inv.due_date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600 max-w-[200px] truncate" title={packageNames.join(', ')}>
                          {packageLabel}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <p className="font-bold text-gray-900 text-xs">{fmtRp(inv.total_amount)}</p>
                          <p className="text-[10px] text-emerald-600 font-medium">Terima {fmtRp(invRealTotal)}</p>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${st.badge}`}>{st.label}</span>
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          {isConfirmDelete ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-[10px] text-red-500 font-medium hidden sm:block">Hapus?</span>
                              <button onClick={() => handleDelete(inv.id)} disabled={deleting}
                                className="text-[10px] bg-red-500 text-white px-2.5 py-1.5 rounded-lg font-semibold hover:bg-red-600 disabled:opacity-60 transition-colors">
                                {deleting ? '...' : 'Hapus'}
                              </button>
                              <button onClick={() => setConfirmDeleteId(null)}
                                className="text-[10px] bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-lg font-semibold hover:bg-gray-200 transition-colors">
                                Batal
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-0.5">
                              <button onClick={() => printInvoice(inv)} title="Cetak / Download PDF"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
                                <Printer size={13}/>
                              </button>
                              {isSuperadmin && (
                                <>
                                  <button onClick={() => startEdit(inv)} title="Edit Invoice"
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
                                    <Pencil size={13}/>
                                  </button>
                                  <button onClick={() => duplicateInvoice(inv)} disabled={duplicatingId === inv.id} title="Duplicate Invoice"
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-50 transition-colors">
                                    <Copy size={13}/>
                                  </button>
                                  <button onClick={() => setConfirmDeleteId(inv.id)} title="Hapus Invoice"
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                    <Trash2 size={13}/>
                                  </button>
                                </>
                              )}
                              <button onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                                {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <div className="border-t border-gray-100 bg-gray-50/50 p-4 space-y-4">
                              {inv.invoice_items && inv.invoice_items.length > 0 && (
                                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-gray-50 text-gray-400 uppercase tracking-wide">
                                        <th className="px-3 py-2.5 text-left font-semibold">Package Name</th>
                                        <th className="px-3 py-2.5 text-left font-semibold">Description</th>
                                        <th className="px-3 py-2.5 text-center font-semibold">Qty</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">Price</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                      {inv.invoice_items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                          <td className="px-3 py-2.5">
                                            <span className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">{item.name}</span>
                                          </td>
                                          <td className="px-3 py-2.5 text-gray-500 whitespace-pre-line">{item.description || '—'}</td>
                                          <td className="px-3 py-2.5 text-center font-bold text-gray-800">{item.qty} {item.scale || 'pc'}</td>
                                          <td className="px-3 py-2.5 text-right text-gray-500">{fmtRp(item.price)}</td>
                                          <td className="px-3 py-2.5 text-right font-bold text-gray-800">{fmtRp(item.amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-1.5 text-xs">
                                  <div className="flex justify-between text-gray-400"><span>Sub Total</span><span className="text-gray-600">{fmtRp(inv.sub_total)}</span></div>
                                  {inv.discount_pct > 0 && (
                                    <div className="flex justify-between text-gray-400"><span>Diskon {inv.discount_pct}%</span><span className="text-red-400">− {fmtRp(Math.round(inv.sub_total * inv.discount_pct / 100))}</span></div>
                                  )}
                                  <div className="flex justify-between text-gray-400"><span>PPN {inv.ppn_pct}%</span><span className="text-gray-600">{fmtRp(Math.round((inv.sub_total - inv.sub_total * inv.discount_pct / 100) * inv.ppn_pct / 100))}</span></div>
                                  <div className="flex justify-between font-bold text-brand-700 text-sm pt-2 border-t border-gray-100">
                                    <span>Total Invoice</span><span>{fmtRp(inv.total_amount)}</span>
                                  </div>
                                  <div className="flex justify-between text-gray-400"><span>PPH {inv.pph_pct ?? 0}%</span><span className="text-red-400">− {fmtRp(invPphAmt)}</span></div>
                                  <div className="flex justify-between font-bold text-emerald-700 pt-1 border-t border-dashed border-gray-100">
                                    <span>Total Diterima</span><span>{fmtRp(invRealTotal)}</span>
                                  </div>
                                </div>
                                <div className="bg-white rounded-xl border border-gray-100 p-4 text-xs">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Info Pembayaran</p>
                                  <p className="font-semibold text-gray-800">{inv.bank_name}</p>
                                  <p className="text-gray-500 mt-0.5">{inv.bank_account_name}</p>
                                  <p className="text-gray-500 font-mono">{inv.bank_account_number}</p>
                                  {inv.notes && <p className="text-gray-400 italic mt-2 text-[10px]">{inv.notes}</p>}
                                </div>
                              </div>

                              {isSuperadmin && inv.status !== 'paid' && (
                                <button onClick={() => markPaid(inv.id)}
                                  className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-sm">
                                  <CheckCircle size={13}/> Tandai Lunas
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
