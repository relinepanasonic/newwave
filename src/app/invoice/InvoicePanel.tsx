'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Save, ChevronDown, ChevronUp, FileText, CheckCircle, Pencil, Trash2 } from 'lucide-react'

const TIPE_LIVE = ['Regular', 'Silver', 'Gold', 'Platinum', 'Rubi', 'UGC', 'Pre Content', 'Background Design', 'Other']

function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

interface ClientProfile { id: string; full_name: string; client_brand: string }

interface InvoiceItem {
  id?: string
  name: string
  description: string
  tipe_live: string
  jam_per_sesi: number
  qty: number
  price: number
  amount: number
  is_free: boolean
}

interface Invoice {
  id: string
  invoice_number: string
  invoice_date: string
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
  invoice_items?: InvoiceItem[]
}

const EMPTY_ITEM: InvoiceItem = {
  name: '', description: '', tipe_live: 'Regular', jam_per_sesi: 4, qty: 1, price: 0, amount: 0, is_free: false,
}

const FORM_DEFAULT = {
  invoice_number: '', invoice_date: new Date().toISOString().slice(0, 10),
  brand: '', invoice_to: '', discount_pct: 0, ppn_pct: 11, pph_pct: 2,
  bank_name: 'Bank BCA', bank_account_name: 'PT Pintu Langit Inovasi Global',
  bank_account_number: '4295775788', notes: '',
}

const STATUS_CONFIG: Record<string, { label: string; badge: string; border: string }> = {
  unpaid: { label: 'Belum Bayar', badge: 'bg-amber-100 text-amber-700', border: 'border-l-amber-400' },
  paid:   { label: 'Lunas',       badge: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-400' },
  cancelled: { label: 'Dibatalkan', badge: 'bg-gray-100 text-gray-500', border: 'border-l-gray-300' },
}

export default function InvoicePanel({ profile }: { profile: any }) {
  const isSuperadmin = profile.role === 'superadmin'
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<ClientProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [form, setForm] = useState({ ...FORM_DEFAULT })
  const [items, setItems] = useState<InvoiceItem[]>([{ ...EMPTY_ITEM }])

  const clientBrand = profile.client_brand

  useEffect(() => {
    const supabase = createClient()
    const invoiceQ = supabase.from('invoices').select('*, invoice_items(*)').order('invoice_date', { ascending: false })
      .then(({ data }) => data || [])
    const clientQ = isSuperadmin
      ? supabase.from('profiles').select('id, full_name, client_brand').eq('role', 'client').not('client_brand', 'is', null)
          .then(({ data }) => (data || []) as ClientProfile[])
      : Promise.resolve([] as ClientProfile[])

    Promise.all([invoiceQ, clientQ] as const).then(([invData, clientData]) => {
      let filtered = invData as Invoice[]
      if (!isSuperadmin && clientBrand) filtered = filtered.filter((inv: Invoice) => inv.brand === clientBrand)
      setInvoices(filtered)
      if (clientData) setClients(clientData as ClientProfile[])
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
      if (field === 'qty' || field === 'price' || field === 'is_free' || field === 'jam_per_sesi') {
        const item = next[idx]
        next[idx].amount = item.is_free ? 0 : Number(item.qty) * Number(item.jam_per_sesi) * Number(item.price)
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
      brand: inv.brand,
      invoice_to: inv.invoice_to || '',
      discount_pct: inv.discount_pct,
      ppn_pct: inv.ppn_pct,
      pph_pct: inv.pph_pct ?? 2,
      bank_name: inv.bank_name || 'Bank BCA',
      bank_account_name: inv.bank_account_name || 'PT Pintu Langit Inovasi Global',
      bank_account_number: inv.bank_account_number || '4295775788',
      notes: inv.notes || '',
    })
    setItems(inv.invoice_items?.map(i => ({
      name: i.name, description: i.description || '',
      tipe_live: i.tipe_live || 'Regular',
      jam_per_sesi: i.jam_per_sesi, qty: i.qty,
      price: i.price, amount: i.amount, is_free: i.is_free,
    })) || [{ ...EMPTY_ITEM }])
    setShowCreate(true)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelForm() {
    setShowCreate(false)
    setEditingId(null)
    setForm({ ...FORM_DEFAULT })
    setItems([{ ...EMPTY_ITEM }])
    setError('')
  }

  async function handleSave() {
    if (!form.invoice_number || !form.brand) { setError('Nomor invoice dan brand wajib diisi'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pph_pct: _pph, ...formRest } = form
    const payload = {
      ...formRest,
      discount_pct: Number(form.discount_pct),
      ppn_pct: Number(form.ppn_pct),
      sub_total: subTotal,
      total_amount: totalAmount,
    }
    const itemsToInsert = items.filter(i => i.name.trim()).map(i => ({
      name: i.name, description: i.description, tipe_live: i.tipe_live,
      jam_per_sesi: Number(i.jam_per_sesi), qty: Number(i.qty),
      price: Number(i.price), amount: Number(i.amount), is_free: i.is_free,
    }))

    if (editingId) {
      const { error: updErr } = await supabase.from('invoices').update(payload).eq('id', editingId)
      if (updErr) { setError(updErr.message); setSaving(false); return }
      await supabase.from('invoice_items').delete().eq('invoice_id', editingId)
      if (itemsToInsert.length > 0)
        await supabase.from('invoice_items').insert(itemsToInsert.map(i => ({ ...i, invoice_id: editingId })))
      setInvoices(prev => prev.map(inv => inv.id === editingId
        ? { ...inv, ...payload, invoice_items: itemsToInsert } : inv))
      cancelForm()
    } else {
      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        ...payload, created_by: profile.id, status: 'unpaid',
      }).select().single()
      if (invErr || !inv) { setError(invErr?.message || 'Gagal menyimpan'); setSaving(false); return }
      if (itemsToInsert.length > 0)
        await supabase.from('invoice_items').insert(itemsToInsert.map(i => ({ ...i, invoice_id: inv.id })))
      setInvoices(prev => [{ ...inv, invoice_items: itemsToInsert } as Invoice, ...prev])
      cancelForm()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    await createClient().from('invoices').delete().eq('id', id)
    setInvoices(prev => prev.filter(inv => inv.id !== id))
    setConfirmDeleteId(null)
    setDeleting(false)
  }

  async function markPaid(id: string) {
    await createClient().from('invoices').update({ status: 'paid' }).eq('id', id)
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'paid' } : inv))
  }

  function calcPph(inv: Invoice) { return Math.round(inv.total_amount * ((inv.pph_pct ?? 2) / 100)) }

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
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">No. Invoice *</label>
            <input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
              placeholder="INV-2026-001"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 transition-shadow"/>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Tanggal</label>
            <input type="date" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Brand *</label>
            <select value={form.brand} onChange={e => handleBrandChange(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
              <option value="">— Pilih Brand —</option>
              {clients.map(c => <option key={c.id} value={c.client_brand}>{c.client_brand}</option>)}
            </select>
          </div>
          <div>
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
                <div className="flex items-start gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400 font-semibold mb-1 block">Nama Paket</label>
                      <input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)}
                        placeholder="NW Silver Package"
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 font-semibold mb-1 block">Tipe Live</label>
                      <select value={item.tipe_live} onChange={e => updateItem(idx, 'tipe_live', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white">
                        {TIPE_LIVE.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  {items.length > 1 && (
                    <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))}
                      className="mt-5 p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                      <X size={13}/>
                    </button>
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-semibold mb-1 block">Deskripsi</label>
                  <input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                    placeholder="4 jam per sesi · Concept Live"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold mb-1 block">Jam/Sesi</label>
                    <input type="number" min="0" step="0.5" value={item.jam_per_sesi}
                      onChange={e => updateItem(idx, 'jam_per_sesi', parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold mb-1 block">QTY (sesi)</label>
                    <input type="number" min="0" value={item.qty}
                      onChange={e => updateItem(idx, 'qty', parseInt(e.target.value) || 0)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold mb-1 block">Harga/Jam</label>
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-brand-400 bg-white">
                      <span className="px-1.5 py-2 bg-gray-50 text-[10px] text-gray-400 border-r border-gray-200 font-semibold">Rp</span>
                      <input type="number" min="0" value={item.price} disabled={item.is_free}
                        onChange={e => updateItem(idx, 'price', parseInt(e.target.value) || 0)}
                        className="flex-1 w-0 px-1.5 py-2 text-xs focus:outline-none disabled:bg-gray-50"/>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold mb-1 block">Amount</label>
                    <div className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-gray-50 font-bold text-gray-700 text-right">
                      {item.is_free ? <span className="text-emerald-600">Free</span> : fmtRp(item.amount)}
                    </div>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer w-fit">
                  <input type="checkbox" checked={item.is_free} onChange={e => updateItem(idx, 'is_free', e.target.checked)} className="rounded accent-brand-600"/>
                  <span className="text-xs text-gray-500">Gratis (Free)</span>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Diskon (%)', key: 'discount_pct' as const },
              { label: 'PPN (%)', key: 'ppn_pct' as const },
              { label: 'PPH (%)', key: 'pph_pct' as const },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{label}</label>
                <input type="number" min="0" max="100" value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"/>
              </div>
            ))}
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

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Bank', key: 'bank_name' as const },
            { label: 'Nama Rekening', key: 'bank_account_name' as const },
            { label: 'No. Rekening', key: 'bank_account_number' as const },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{label}</label>
              <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
            </div>
          ))}
        </div>

        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Catatan</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2} placeholder="For any question please contact us"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"/>
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

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Invoice</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isSuperadmin ? `${invoices.length} invoice terdaftar` : `Invoice untuk brand ${clientBrand}`}
          </p>
        </div>
        {isSuperadmin && !showCreate && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm">
            <Plus size={15}/> Buat Invoice
          </button>
        )}
      </div>

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
      ) : (
        <div className="space-y-3">
          {invoices.map(inv => {
            const isExpanded = expandedId === inv.id
            const totalSesi = inv.invoice_items?.reduce((s, i) => s + (i.qty || 0), 0) || 0
            const totalJam = inv.invoice_items?.reduce((s, i) => s + ((i.qty || 0) * (i.jam_per_sesi || 0)), 0) || 0
            const invPphAmt = calcPph(inv)
            const invRealTotal = inv.total_amount - invPphAmt
            const st = STATUS_CONFIG[inv.status] || STATUS_CONFIG.unpaid
            const isConfirmDelete = confirmDeleteId === inv.id

            return (
              <div key={inv.id}
                className={`bg-white rounded-2xl border border-gray-100 border-l-4 shadow-sm overflow-hidden transition-shadow hover:shadow-md ${st.border}`}>
                <div className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-brand-600"/>
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : inv.id)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900 text-sm">{inv.invoice_number}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.badge}`}>{st.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {inv.brand}{inv.invoice_to ? ` · ${inv.invoice_to}` : ''}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(inv.invoice_date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {totalSesi > 0 && ` · ${totalSesi} sesi · ${totalJam}j`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 mr-1">
                    <p className="font-bold text-gray-900 text-sm">{fmtRp(inv.total_amount)}</p>
                    <p className="text-[10px] text-emerald-600 font-medium">Terima {fmtRp(invRealTotal)}</p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {isSuperadmin && !isConfirmDelete && (
                      <>
                        <button onClick={() => startEdit(inv)} title="Edit Invoice"
                          className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
                          <Pencil size={14}/>
                        </button>
                        <button onClick={() => setConfirmDeleteId(inv.id)} title="Hapus Invoice"
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={14}/>
                        </button>
                      </>
                    )}
                    {isSuperadmin && isConfirmDelete && (
                      <div className="flex items-center gap-1.5 pl-1">
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
                    )}
                    <button onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                      className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 transition-colors ml-0.5">
                      {isExpanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50 p-4 space-y-4">
                    {inv.invoice_items && inv.invoice_items.length > 0 && (
                      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 text-gray-400 uppercase tracking-wide">
                              <th className="px-3 py-2.5 text-left font-semibold">Nama Paket</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Tipe</th>
                              <th className="px-3 py-2.5 text-center font-semibold">Jam</th>
                              <th className="px-3 py-2.5 text-center font-semibold">QTY</th>
                              <th className="px-3 py-2.5 text-right font-semibold">Harga</th>
                              <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {inv.invoice_items.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                <td className="px-3 py-2.5">
                                  <p className="font-semibold text-gray-800">{item.name}</p>
                                  {item.description && <p className="text-gray-400 text-[10px] mt-0.5">{item.description}</p>}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">{item.tipe_live}</span>
                                </td>
                                <td className="px-3 py-2.5 text-center text-gray-500">{item.jam_per_sesi}j</td>
                                <td className="px-3 py-2.5 text-center font-bold text-gray-800">{item.qty}</td>
                                <td className="px-3 py-2.5 text-right text-gray-500">{item.is_free ? 'Free' : fmtRp(item.price)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-gray-800">{item.is_free ? '—' : fmtRp(item.amount)}</td>
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
                        <div className="flex justify-between text-gray-400"><span>PPH {inv.pph_pct ?? 2}%</span><span className="text-red-400">− {fmtRp(invPphAmt)}</span></div>
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

                    {isSuperadmin && inv.status === 'unpaid' && (
                      <button onClick={() => markPaid(inv.id)}
                        className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-sm">
                        <CheckCircle size={13}/> Tandai Lunas
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
