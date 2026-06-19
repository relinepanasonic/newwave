'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Save, ChevronDown, ChevronUp, FileText, CheckCircle, Clock } from 'lucide-react'

const TIPE_LIVE = ['Regular', 'Silver', 'Gold', 'Platinum', 'Rubi', 'UGC', 'Pre Content', 'Background Design', 'Other']
const STATUS_COLORS: Record<string, string> = {
  unpaid: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

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
  name: '', description: '', tipe_live: 'Regular', jam_per_sesi: 4, qty: 1, price: 0, amount: 0, is_free: false
}

export default function InvoiceClient({ profile }: { profile: any }) {
  const isSuperadmin = profile.role === 'superadmin'
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    invoice_number: '', invoice_date: new Date().toISOString().slice(0, 10),
    brand: '', invoice_to: '', discount_pct: 0, ppn_pct: 11,
    bank_name: 'Bank BCA', bank_account_name: 'PT Pintu Langit Inovasi Global',
    bank_account_number: '4295775788', notes: '',
  })
  const [items, setItems] = useState<InvoiceItem[]>([{ ...EMPTY_ITEM }])

  const clientBrand = profile.client_brand

  useEffect(() => {
    const supabase = createClient()
    let query = supabase.from('invoices')
      .select('*, invoice_items(*)')
      .order('invoice_date', { ascending: false })

    if (!isSuperadmin && clientBrand) {
      query = query.eq('brand', clientBrand)
    }

    query.then(({ data }) => {
      setInvoices(data || [])
      setLoading(false)
    })
  }, [isSuperadmin, clientBrand])

  function updateItem(idx: number, field: keyof InvoiceItem, value: any) {
    setItems(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      if (field === 'qty' || field === 'price' || field === 'is_free') {
        const item = next[idx]
        next[idx].amount = item.is_free ? 0 : (Number(item.qty) * Number(item.price))
      }
      return next
    })
  }

  const subTotal = items.reduce((s, i) => s + (i.amount || 0), 0)
  const discountAmt = Math.round(subTotal * (form.discount_pct / 100))
  const ppnAmt = Math.round((subTotal - discountAmt) * (form.ppn_pct / 100))
  const totalAmount = subTotal - discountAmt + ppnAmt

  async function handleSave() {
    if (!form.invoice_number || !form.brand) { setError('Nomor invoice dan brand wajib diisi'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const { data: inv, error: invErr } = await supabase.from('invoices').insert({
      ...form,
      discount_pct: Number(form.discount_pct),
      ppn_pct: Number(form.ppn_pct),
      sub_total: subTotal,
      total_amount: totalAmount,
      created_by: profile.id,
      status: 'unpaid',
    }).select().single()

    if (invErr || !inv) { setError(invErr?.message || 'Gagal menyimpan'); setSaving(false); return }

    const itemsToInsert = items.filter(i => i.name.trim()).map(i => ({
      invoice_id: inv.id,
      name: i.name,
      description: i.description,
      tipe_live: i.tipe_live,
      jam_per_sesi: Number(i.jam_per_sesi),
      qty: Number(i.qty),
      price: Number(i.price),
      amount: Number(i.amount),
      is_free: i.is_free,
    }))

    if (itemsToInsert.length > 0) {
      await supabase.from('invoice_items').insert(itemsToInsert)
    }

    setSaving(false)
    setShowCreate(false)
    setInvoices(prev => [{ ...inv, invoice_items: itemsToInsert } as Invoice, ...prev])
    setForm({ invoice_number: '', invoice_date: new Date().toISOString().slice(0, 10), brand: '', invoice_to: '', discount_pct: 0, ppn_pct: 11, bank_name: 'Bank BCA', bank_account_name: 'PT Pintu Langit Inovasi Global', bank_account_number: '4295775788', notes: '' })
    setItems([{ ...EMPTY_ITEM }])
  }

  async function markPaid(id: string) {
    await createClient().from('invoices').update({ status: 'paid' }).eq('id', id)
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'paid' } : inv))
  }

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Invoice</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isSuperadmin ? `${invoices.length} invoice terdaftar` : `Invoice untuk brand ${clientBrand}`}
            </p>
          </div>
          {isSuperadmin && (
            <button onClick={() => setShowCreate(s => !s)}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors">
              <Plus size={16}/> Buat Invoice
            </button>
          )}
        </div>

        {/* Create form */}
        {showCreate && isSuperadmin && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-brand-50 flex items-center justify-between">
              <h2 className="font-bold text-brand-900 text-sm">Buat Invoice Baru</h2>
              <button onClick={() => setShowCreate(false)}><X size={16} className="text-gray-400"/></button>
            </div>
            <div className="p-5 space-y-4">

              {/* Header info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">No. Invoice *</label>
                  <input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                    placeholder="INV-2026-001"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Tanggal</label>
                  <input type="date" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Brand *</label>
                  <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    placeholder="Nama brand"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Invoice To</label>
                  <input value={form.invoice_to} onChange={e => setForm(f => ({ ...f, invoice_to: e.target.value }))}
                    placeholder="Nama perusahaan/kontak"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item Layanan</label>
                  <button type="button" onClick={() => setItems(p => [...p, { ...EMPTY_ITEM }])}
                    className="text-xs text-brand-600 font-semibold hover:underline">+ Tambah Item</button>
                </div>
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-gray-400 font-medium mb-0.5 block">Nama Paket</label>
                            <input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)}
                              placeholder="NW Silver Package Live Only"
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400 font-medium mb-0.5 block">Tipe Live</label>
                            <select value={item.tipe_live} onChange={e => updateItem(idx, 'tipe_live', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white">
                              {TIPE_LIVE.map(t => <option key={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                        {items.length > 1 && (
                          <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))}
                            className="mt-4 p-1 text-gray-400 hover:text-red-500"><X size={14}/></button>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 font-medium mb-0.5 block">Deskripsi</label>
                        <input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                          placeholder="• 4 jam per sesi&#10;• Concept Live"
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-400 font-medium mb-0.5 block">Jam/Sesi</label>
                          <input type="number" min="0" step="0.5" value={item.jam_per_sesi}
                            onChange={e => updateItem(idx, 'jam_per_sesi', parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 font-medium mb-0.5 block">QTY (sesi)</label>
                          <input type="number" min="0" value={item.qty}
                            onChange={e => updateItem(idx, 'qty', parseInt(e.target.value) || 0)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"/>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 font-medium mb-0.5 block">Harga/sesi</label>
                          <input type="number" min="0" value={item.price} disabled={item.is_free}
                            onChange={e => updateItem(idx, 'price', parseInt(e.target.value) || 0)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white disabled:bg-gray-100"/>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 font-medium mb-0.5 block">Amount</label>
                          <div className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-gray-100 font-semibold text-gray-700">
                            {item.is_free ? 'Free' : fmtRp(item.amount)}
                          </div>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={item.is_free} onChange={e => updateItem(idx, 'is_free', e.target.checked)}
                          className="rounded"/>
                        <span className="text-xs text-gray-500">Gratis (Free)</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Diskon (%)</label>
                    <input type="number" min="0" max="100" value={form.discount_pct}
                      onChange={e => setForm(f => ({ ...f, discount_pct: parseFloat(e.target.value) || 0 }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">PPN (%)</label>
                    <input type="number" min="0" max="100" value={form.ppn_pct}
                      onChange={e => setForm(f => ({ ...f, ppn_pct: parseFloat(e.target.value) || 0 }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"/>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Sub Total</span><span className="font-medium">{fmtRp(subTotal)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Diskon {form.discount_pct}%</span><span className="font-medium text-red-500">- {fmtRp(discountAmt)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>PPN {form.ppn_pct}%</span><span className="font-medium">{fmtRp(ppnAmt)}</span></div>
                  <div className="flex justify-between text-brand-700 font-bold text-base pt-2 border-t border-gray-200">
                    <span>Total Amount</span><span>{fmtRp(totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Payment info */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Bank</label>
                  <input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Nama Rekening</label>
                  <input value={form.bank_account_name} onChange={e => setForm(f => ({ ...f, bank_account_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">No. Rekening</label>
                  <input value={form.bank_account_number} onChange={e => setForm(f => ({ ...f, bank_account_number: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Catatan</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="For any question please contact us"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"/>
              </div>

              {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

              <button onClick={handleSave} disabled={saving}
                className="w-full bg-brand-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2">
                <Save size={14}/> {saving ? 'Menyimpan...' : 'Simpan Invoice'}
              </button>
            </div>
          </div>
        )}

        {/* Invoice list */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-400">Memuat...</div>
        ) : invoices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-400">Belum ada invoice</div>
        ) : (
          <div className="space-y-3">
            {invoices.map(inv => {
              const isExpanded = expandedId === inv.id
              const totalSesi = inv.invoice_items?.reduce((s, i) => s + (i.qty || 0), 0) || 0
              const totalJam = inv.invoice_items?.reduce((s, i) => s + ((i.qty || 0) * (i.jam_per_sesi || 0)), 0) || 0
              return (
                <div key={inv.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-4 flex items-start gap-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : inv.id)}>
                    <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText size={18} className="text-brand-600"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-900 text-sm">{inv.invoice_number}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[inv.status] || STATUS_COLORS.unpaid}`}>
                          {inv.status === 'paid' ? '✓ Lunas' : inv.status === 'cancelled' ? 'Dibatalkan' : '⏳ Belum Bayar'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{inv.brand} {inv.invoice_to ? `· ${inv.invoice_to}` : ''}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(inv.invoice_date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {totalSesi > 0 && ` · ${totalSesi} sesi · ${totalJam} jam`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-brand-700 text-sm">{fmtRp(inv.total_amount)}</p>
                      {isExpanded ? <ChevronUp size={14} className="text-gray-400 ml-auto mt-1"/> : <ChevronDown size={14} className="text-gray-400 ml-auto mt-1"/>}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-100 p-4 space-y-4">
                      {/* Items table */}
                      {inv.invoice_items && inv.invoice_items.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                                <th className="px-3 py-2 text-left font-semibold">Nama Paket</th>
                                <th className="px-3 py-2 text-left font-semibold">Tipe</th>
                                <th className="px-3 py-2 text-center font-semibold">Jam/Sesi</th>
                                <th className="px-3 py-2 text-center font-semibold">QTY</th>
                                <th className="px-3 py-2 text-right font-semibold">Harga</th>
                                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {inv.invoice_items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-3 py-2.5">
                                    <p className="font-medium text-gray-800">{item.name}</p>
                                    {item.description && <p className="text-gray-400 text-[10px] mt-0.5">{item.description}</p>}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded-full font-medium">{item.tipe_live}</span>
                                  </td>
                                  <td className="px-3 py-2.5 text-center text-gray-600">{item.jam_per_sesi}j</td>
                                  <td className="px-3 py-2.5 text-center font-semibold text-gray-800">{item.qty}</td>
                                  <td className="px-3 py-2.5 text-right text-gray-600">{item.is_free ? 'Free' : fmtRp(item.price)}</td>
                                  <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{item.is_free ? '0' : fmtRp(item.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Summary */}
                      <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-xs">
                        <div className="flex justify-between text-gray-500"><span>Sub Total</span><span>{fmtRp(inv.sub_total)}</span></div>
                        <div className="flex justify-between text-gray-500"><span>Diskon {inv.discount_pct}%</span><span className="text-red-500">- {fmtRp(Math.round(inv.sub_total * inv.discount_pct / 100))}</span></div>
                        <div className="flex justify-between text-gray-500"><span>PPN {inv.ppn_pct}%</span><span>{fmtRp(Math.round((inv.sub_total - inv.sub_total * inv.discount_pct / 100) * inv.ppn_pct / 100))}</span></div>
                        <div className="flex justify-between font-bold text-brand-700 text-sm pt-1.5 border-t border-gray-200">
                          <span>Total</span><span>{fmtRp(inv.total_amount)}</span>
                        </div>
                      </div>

                      {/* Payment info */}
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <p className="font-semibold text-gray-700">Pembayaran:</p>
                        <p>{inv.bank_name} · {inv.bank_account_name} · {inv.bank_account_number}</p>
                        {inv.notes && <p className="italic">{inv.notes}</p>}
                      </div>

                      {/* Actions */}
                      {isSuperadmin && inv.status === 'unpaid' && (
                        <button onClick={() => markPaid(inv.id)}
                          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors">
                          <CheckCircle size={12}/> Tandai Lunas
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
    </AppShell>
  )
}
