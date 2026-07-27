'use client'
import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Trash2, Copy, Check, Download } from 'lucide-react'
import InvoicePanel from '@/app/invoice/InvoicePanel'
import CurrencyInput from '@/components/CurrencyInput'

type Tab = 'dashboard' | 'invoice' | 'expenses' | 'report'
const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
const CATEGORIES = ['Ops', 'Salary', 'Marketing', 'Rent', 'Utilities', 'Equipment', 'Other']
const PAYMENT_METHODS = ['Cash', 'Transfer Bank', 'QRIS', 'Other']

function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Math.round(n))
}
function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface InvoiceRow { id: string; status: string; total_amount: number; invoice_date: string }
interface ExpenseRow {
  id: string; date: string; category: string; amount: number; description: string | null
  vendor: string | null; payment_method: string | null; brand: string | null
  receipt_url: string | null; source: string
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' }) {
  const color = tone === 'up' ? 'text-emerald-700' : tone === 'down' ? 'text-red-600' : 'text-gray-900'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function usePeriod() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`
  return { year, setYear, month, setMonth, start, end }
}

function PeriodPicker({ p }: { p: ReturnType<typeof usePeriod> }) {
  return (
    <div className="flex gap-2">
      <select value={p.month} onChange={e => p.setMonth(Number(e.target.value))}
        className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      <select value={p.year} onChange={e => p.setYear(Number(e.target.value))}
        className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
        {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab() {
  const p = usePeriod()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const supabase = createClient()
    Promise.all([
      supabase.from('invoices').select('id, status, total_amount, invoice_date')
        .gte('invoice_date', p.start).lte('invoice_date', p.end),
      supabase.from('expenses').select('*').gte('date', p.start).lte('date', p.end),
    ]).then(([invRes, expRes]) => {
      setInvoices((invRes.data as InvoiceRow[]) || [])
      setExpenses((expRes.data as ExpenseRow[]) || [])
      setLoading(false)
    })
  }, [p.start, p.end])

  const totalBilled = invoices.reduce((s, i) => s + Number(i.total_amount), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount), 0)
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const net = totalPaid - totalExpenses

  const byCategory: Record<string, number> = {}
  expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount) })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{MONTHS[p.month - 1]} {p.year}</p>
        <PeriodPicker p={p}/>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-20 animate-pulse"/>)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card label="Total Ditagih" value={fmtRp(totalBilled)} sub={`${invoices.length} invoice`}/>
            <Card label="Total Diterima" value={fmtRp(totalPaid)} tone="up" sub={`${invoices.filter(i => i.status === 'paid').length} lunas`}/>
            <Card label="Total Expenses" value={fmtRp(totalExpenses)} tone="down" sub={`${expenses.length} entri`}/>
            <Card label="Net Profit" value={fmtRp(net)} tone={net >= 0 ? 'up' : 'down'} sub="Diterima − Expenses"/>
          </div>

          {Object.keys(byCategory).length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Expenses per Kategori</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(byCategory).sort(([, a], [, b]) => b - a).map(([cat, amt]) => (
                  <div key={cat} className="bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 text-xs">
                    <span className="text-gray-500">{cat}:</span>{' '}
                    <span className="font-bold text-red-600">{fmtRp(amt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Expenses ─────────────────────────────────────────────────────────────────
const EMPTY_EXPENSE_FORM = {
  date: new Date().toISOString().slice(0, 10), category: 'Ops', amount: 0,
  description: '', vendor: '', payment_method: 'Cash', brand: '',
}

function ExpensesTab() {
  const p = usePeriod()
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_EXPENSE_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showApiInfo, setShowApiInfo] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    createClient().from('expenses').select('*')
      .gte('date', p.start).lte('date', p.end)
      .order('date', { ascending: false })
      .then(({ data }) => { setExpenses((data as ExpenseRow[]) || []); setLoading(false) })
  }, [p.start, p.end])
  useEffect(() => { load() }, [load])

  async function saveExpense() {
    if (!form.date || form.amount <= 0) { setError('Tanggal dan jumlah wajib diisi'); return }
    setSaving(true); setError('')
    const { data: { user } } = await createClient().auth.getUser()
    const { data, error: err } = await createClient().from('expenses').insert({
      date: form.date, category: form.category, amount: form.amount,
      description: form.description || null, vendor: form.vendor || null,
      payment_method: form.payment_method || null, brand: form.brand || null,
      source: 'manual', created_by: user?.id || null,
    }).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setExpenses(prev => [data as ExpenseRow, ...prev])
    setShowForm(false)
    setForm({ ...EMPTY_EXPENSE_FORM })
  }

  async function deleteExpense(id: string) {
    await createClient().from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
    setConfirmDeleteId(null)
  }

  const apiSample = `curl -X POST https://app.newwave.id/api/accounting/expenses \\
  -H "Authorization: Bearer <ACCOUNTING_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "date": "2026-07-25",
    "category": "Ops",
    "amount": 500000,
    "description": "Internet bulanan",
    "vendor": "Indihome",
    "payment_method": "Transfer Bank",
    "brand": "Niko Electronic",
    "source": "proone",
    "external_id": "proone-txn-1029"
  }'`

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{MONTHS[p.month - 1]} {p.year}</p>
        <div className="flex items-center gap-2">
          <PeriodPicker p={p}/>
          <button onClick={() => setShowApiInfo(s => !s)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-600 hover:bg-gray-50 transition-colors">
            API
          </button>
          <button onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-1.5 bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-brand-700 transition-colors">
            <Plus size={14}/> Tambah Expense
          </button>
        </div>
      </div>

      {showApiInfo && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-sm font-bold text-gray-900">Push Expenses via API</p>
          <p className="text-xs text-gray-500">
            Endpoint terima push dari aplikasi lain. Butuh env var <code className="bg-gray-100 px-1 py-0.5 rounded text-[11px]">ACCOUNTING_API_KEY</code> di server.
            Kirim <code className="bg-gray-100 px-1 py-0.5 rounded text-[11px]">source</code> + <code className="bg-gray-100 px-1 py-0.5 rounded text-[11px]">external_id</code> supaya push ulang tidak duplikat (upsert otomatis).
            Bisa juga kirim banyak sekaligus lewat <code className="bg-gray-100 px-1 py-0.5 rounded text-[11px]">{'{ "expenses": [...] }'}</code>.
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

      {showForm && (
        <div className="bg-white rounded-2xl border border-brand-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-bold text-gray-900 text-sm">Expense Baru</p>
            <button onClick={() => { setShowForm(false); setError('') }}><X size={16} className="text-gray-400"/></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Tanggal *</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Kategori</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Jumlah (Rp) *</label>
              <CurrencyInput value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} placeholder="500.000"/>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Vendor</label>
              <input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Metode Bayar</label>
              <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Brand (opsional)</label>
              <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Deskripsi</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={saveExpense} disabled={saving}
              className="bg-brand-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan Expense'}
            </button>
            <button onClick={() => { setShowForm(false); setError('') }}
              className="px-4 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Batal</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 h-32 animate-pulse"/>
      ) : expenses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center text-sm text-gray-400">
          Belum ada expense untuk periode ini
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Tanggal</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Kategori</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Vendor</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Brand</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Jumlah</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Sumber</th>
                  <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenses.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600">{fmtDate(e.date)}</td>
                    <td className="px-3 py-3 text-xs text-gray-700 font-medium">{e.category}</td>
                    <td className="px-3 py-3 text-xs text-gray-600">{e.vendor || '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-600">{e.brand || '—'}</td>
                    <td className="px-3 py-3 text-right text-xs font-bold text-red-600 whitespace-nowrap">{fmtRp(e.amount)}</td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${
                        e.source === 'manual' ? 'bg-gray-100 text-gray-500' : 'bg-brand-50 text-brand-700'}`}>
                        {e.source}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {confirmDeleteId === e.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => deleteExpense(e.id)}
                            className="text-[10px] bg-red-500 text-white px-2 py-1 rounded-lg font-semibold hover:bg-red-600">Hapus</button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-semibold hover:bg-gray-200">Batal</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(e.id)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={13}/>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Report ───────────────────────────────────────────────────────────────────
function ReportTab() {
  const p = usePeriod()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const supabase = createClient()
    Promise.all([
      supabase.from('invoices').select('id, status, total_amount, invoice_date')
        .gte('invoice_date', p.start).lte('invoice_date', p.end),
      supabase.from('expenses').select('*').gte('date', p.start).lte('date', p.end),
    ]).then(([invRes, expRes]) => {
      setInvoices((invRes.data as InvoiceRow[]) || [])
      setExpenses((expRes.data as ExpenseRow[]) || [])
      setLoading(false)
    })
  }, [p.start, p.end])

  const revenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount), 0)
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const netProfit = revenue - totalExpenses
  const byCategory: Record<string, number> = {}
  expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount) })
  const sortedCategories = Object.entries(byCategory).sort(([, a], [, b]) => b - a)

  async function exportExcel() {
    const { utils, writeFile } = await import('xlsx')
    const wb = utils.book_new()
    const summarySheet = utils.json_to_sheet([
      { Keterangan: 'Revenue (invoice lunas)', Nilai: revenue },
      { Keterangan: 'Total Expenses', Nilai: -totalExpenses },
      { Keterangan: 'Net Profit', Nilai: netProfit },
    ])
    utils.book_append_sheet(wb, summarySheet, 'Ringkasan')
    const expenseSheet = utils.json_to_sheet(expenses.map(e => ({
      Tanggal: e.date, Kategori: e.category, Vendor: e.vendor || '', Brand: e.brand || '',
      'Metode Bayar': e.payment_method || '', Jumlah: e.amount, Sumber: e.source, Deskripsi: e.description || '',
    })))
    utils.book_append_sheet(wb, expenseSheet, 'Expenses')
    writeFile(wb, `Laporan_${MONTHS[p.month - 1]}_${p.year}.xlsx`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">Laporan {MONTHS[p.month - 1]} {p.year}</p>
        <div className="flex items-center gap-2">
          <PeriodPicker p={p}/>
          <button onClick={exportExcel}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors">
            <Download size={14}/> Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-20 animate-pulse"/>)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card label="Revenue (Invoice Lunas)" value={fmtRp(revenue)} tone="up"/>
            <Card label="Total Expenses" value={fmtRp(totalExpenses)} tone="down"/>
            <Card label="Net Profit" value={fmtRp(netProfit)} tone={netProfit >= 0 ? 'up' : 'down'}/>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <p className="px-4 py-3 text-xs font-bold text-gray-500 border-b border-gray-50">Expenses per Kategori</p>
            {sortedCategories.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">Tidak ada expense periode ini</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {sortedCategories.map(([cat, amt]) => (
                  <div key={cat} className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-sm text-gray-700">{cat}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                        <div className="h-full bg-red-400 rounded-full" style={{ width: `${totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0}%` }}/>
                      </div>
                      <span className="text-sm font-bold text-red-600 w-28 text-right">{fmtRp(amt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function AccountingClient({ profile }: { profile: any }) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const TAB_LABELS: Record<Tab, string> = { dashboard: 'Dashboard', invoice: 'Invoice', expenses: 'Expenses', report: 'Report' }

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Accounting</h1>
          <p className="text-sm text-gray-500 mt-0.5">Dashboard keuangan, invoice, expenses, dan laporan</p>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
          {(['dashboard', 'invoice', 'expenses', 'report'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && <DashboardTab/>}
        {tab === 'invoice' && <InvoicePanel profile={profile}/>}
        {tab === 'expenses' && <ExpensesTab/>}
        {tab === 'report' && <ReportTab/>}
      </div>
    </AppShell>
  )
}
