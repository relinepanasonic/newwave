'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Plus, X, ChevronDown, ChevronUp, ExternalLink, Lock, Unlock, Trash2, Upload } from 'lucide-react'
import CurrencyInput from '@/components/CurrencyInput'
import { tr } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'

interface PC {
  id: string; cash_id: string; host_id: string; amount: number; notes: string | null
  status: 'pending' | 'active' | 'closed'; created_at: string; accepted_at: string | null; closed_at: string | null
  profiles: { full_name: string } | null
}
interface PCItem {
  id: string; petty_cash_id: string; tanggal: string; remark: string | null
  cash_out: number; receipt_url: string | null; created_at: string
}

function fmtDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
function todayStr() { return new Date().toISOString().split('T')[0] }

function nextCashId(existing: string[]): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const prefix = `PC${yy}${mm}`
  const seqs = existing
    .filter(id => id.startsWith(prefix))
    .map(id => parseInt(id.slice(prefix.length), 10))
    .filter(n => !isNaN(n))
  const max = seqs.length ? Math.max(...seqs) : 0
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  active:  'bg-emerald-100 text-emerald-700',
  closed:  'bg-gray-100 text-gray-500',
}
const STATUS_KEY: Record<string, string> = {
  pending: 'statusMenungguKonfirmasi',
  active:  'statusAktif',
  closed:  'statusSelesai',
}

export default function PettyCashPanel() {
  const { lang } = useLang()
  const [pcs, setPcs] = useState<PC[]>([])
  const [hosts, setHosts] = useState<{ id: string; full_name: string }[]>([])
  const [items, setItems] = useState<Record<string, PCItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ host_id: '', amount: 0, notes: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Edit item (superadmin can always edit)
  const [editItem, setEditItem] = useState<PCItem | null>(null)
  const [editItemForm, setEditItemForm] = useState({ tanggal: '', remark: '', cash_out: 0 })
  const [savingItem, setSavingItem] = useState(false)

  // Add item (superadmin can log an expense directly)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [newItem, setNewItem] = useState({ tanggal: todayStr(), remark: '', cash_out: 0 })
  const [newItemFile, setNewItemFile] = useState<File | null>(null)
  const [addingItemSaving, setAddingItemSaving] = useState(false)
  const [addItemError, setAddItemError] = useState('')
  const [uploadProgress, setUploadProgress] = useState('')

  // Confirm close
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [pcsRes, hostsRes] = await Promise.all([
      supabase.from('petty_cash')
        .select('*, profiles:host_id(full_name)')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').in('role', ['host', 'host_manager', 'operator']).order('full_name'),
    ])
    setPcs((pcsRes.data as PC[]) || [])
    setHosts(hostsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function loadItems(pcId: string) {
    if (items[pcId]) return
    const { data } = await createClient().from('petty_cash_items')
      .select('*').eq('petty_cash_id', pcId).order('tanggal').order('created_at')
    setItems(prev => ({ ...prev, [pcId]: (data as PCItem[]) || [] }))
  }

  function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id); loadItems(id)
  }

  async function createPC() {
    if (!form.host_id || !form.amount || form.amount <= 0) {
      setFormError(tr('pilihHostIsiNominal', lang)); return
    }
    setSaving(true); setFormError('')
    const supabase = createClient()
    const allIds = pcs.map(p => p.cash_id)
    const cashId = nextCashId(allIds)
    const { data: me } = await supabase.auth.getUser()
    const { error } = await supabase.from('petty_cash').insert({
      cash_id: cashId, host_id: form.host_id, amount: form.amount,
      notes: form.notes || null, status: 'pending', created_by: me.user?.id,
    })
    setSaving(false)
    if (error) { setFormError(error.message); return }
    setShowForm(false); setForm({ host_id: '', amount: 0, notes: '' }); load()
  }

  async function closePC(id: string) {
    await createClient().from('petty_cash')
      .update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', id)
    setPcs(prev => prev.map(p => p.id === id ? { ...p, status: 'closed', closed_at: new Date().toISOString() } : p))
    setConfirmCloseId(null)
  }

  async function reopenPC(id: string) {
    await createClient().from('petty_cash').update({ status: 'active', closed_at: null }).eq('id', id)
    setPcs(prev => prev.map(p => p.id === id ? { ...p, status: 'active', closed_at: null } : p))
  }

  async function deletePC(id: string) {
    await createClient().from('petty_cash').delete().eq('id', id)
    setPcs(prev => prev.filter(p => p.id !== id))
    if (expanded === id) setExpanded(null)
    setConfirmDeleteId(null)
  }

  async function saveEditItem() {
    if (!editItem) return
    setSavingItem(true)
    const { error } = await createClient().from('petty_cash_items').update({
      tanggal: editItemForm.tanggal, remark: editItemForm.remark || null,
      cash_out: editItemForm.cash_out || 0,
    }).eq('id', editItem.id)
    setSavingItem(false)
    if (error) return
    setItems(prev => ({
      ...prev,
      [editItem.petty_cash_id]: (prev[editItem.petty_cash_id] || []).map(i =>
        i.id === editItem.id
          ? { ...i, tanggal: editItemForm.tanggal, remark: editItemForm.remark, cash_out: editItemForm.cash_out }
          : i
      ),
    }))
    setEditItem(null)
  }

  async function deleteItem(item: PCItem) {
    await createClient().from('petty_cash_items').delete().eq('id', item.id)
    setItems(prev => ({
      ...prev,
      [item.petty_cash_id]: (prev[item.petty_cash_id] || []).filter(i => i.id !== item.id),
    }))
  }

  async function addItem(pc: PC) {
    if (!newItem.tanggal || !newItem.cash_out || newItem.cash_out <= 0) {
      setAddItemError(tr('isiTanggalJumlah', lang)); return
    }
    setAddingItemSaving(true); setAddItemError(''); setUploadProgress('')

    let receiptUrl: string | null = null
    if (newItemFile) {
      setUploadProgress(tr('mengunggahBukti', lang))
      const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      try {
        const b64 = await toBase64(newItemFile)
        const res = await fetch('/api/petty-cash/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host_name: pc.profiles?.full_name || 'Tanpa Nama',
            cash_id: pc.cash_id,
            filename: newItemFile.name,
            mime: newItemFile.type,
            base64: b64,
          }),
        })
        const json = await res.json()
        if (json.fileUrl) receiptUrl = json.fileUrl
        else if (!json.skipped) setAddItemError(`${tr('buktiGagalDiunggah', lang)} ${json.error || 'Unknown error'}`)
      } catch {
        setAddItemError(tr('buktiGagalKoneksi', lang))
      }
      setUploadProgress('')
    }

    const { data, error } = await createClient().from('petty_cash_items').insert({
      petty_cash_id: pc.id,
      tanggal: newItem.tanggal,
      remark: newItem.remark || null,
      cash_out: newItem.cash_out,
      receipt_url: receiptUrl,
    }).select().single()

    if (error) { setAddItemError(error.message); setAddingItemSaving(false); return }

    setItems(prev => ({ ...prev, [pc.id]: [...(prev[pc.id] || []), data as PCItem] }))
    setNewItem({ tanggal: todayStr(), remark: '', cash_out: 0 })
    setNewItemFile(null)
    setAddingTo(null)
    setAddingItemSaving(false)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-gray-900">{tr('pettyCashTitle', lang)}</h2>
          <p className="text-sm text-gray-500">{pcs.length} {tr('catatanUangOperasional', lang)}</p>
        </div>
        <button onClick={() => { setShowForm(true); setFormError('') }}
          className="flex items-center gap-1.5 bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-brand-700 transition-colors shadow-sm">
          <Plus size={15}/> {tr('buatPettyCash', lang)}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-brand-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900 text-sm">{tr('buatPettyCashBaru', lang)}</p>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-gray-400"/></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{tr('hostReq', lang)}</label>
              <select value={form.host_id} onChange={e => setForm(f => ({ ...f, host_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                <option value="">{tr('pilihHostDropdown', lang)}</option>
                {hosts.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{tr('nominalRpReq', lang)}</label>
              <CurrencyInput value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))}
                placeholder="500.000"/>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{tr('catatanKeperluan', lang)}</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder={tr('transportEventPlaceholder', lang)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
          </div>
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
              {tr('cancel', lang)}
            </button>
            <button onClick={createPC} disabled={saving}
              className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-60">
              {saving ? tr('membuat', lang) : tr('buatKirimKeHost', lang)}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">{tr('loading', lang)}</div>
      ) : pcs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <p className="text-sm text-gray-400">{tr('belumAdaPettyCash', lang)}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pcs.map(pc => {
            const pcItems = items[pc.id] || []
            const spent = pcItems.reduce((s, i) => s + Number(i.cash_out), 0)
            const remaining = Number(pc.amount) - spent
            const pct = Math.min(100, Math.round((spent / Number(pc.amount)) * 100))
            const isExpanded = expanded === pc.id
            let runningBalance = Number(pc.amount)

            return (
              <div key={pc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-bold text-brand-600">{pc.cash_id}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_STYLE[pc.status]}`}>
                        {tr(STATUS_KEY[pc.status], lang)}
                      </span>
                    </div>
                    <p className="font-bold text-gray-900 text-sm">{(pc.profiles as any)?.full_name || '—'}</p>
                    {pc.notes && <p className="text-xs text-gray-400 mt-0.5">{pc.notes}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <span className="text-gray-500">{tr('diberikanLabel', lang)} <span className="font-bold text-gray-900">{formatCurrency(Number(pc.amount))}</span></span>
                      {pcItems.length > 0 && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="text-red-500">{tr('terpakaiLabel', lang)} <span className="font-bold">{formatCurrency(spent)}</span></span>
                          <span className="text-gray-300">·</span>
                          <span className={remaining <= 0 ? 'text-gray-400' : 'text-emerald-600'}>
                            {tr('sisaColonLabel', lang)} <span className="font-bold">{formatCurrency(Math.max(0, remaining))}</span>
                          </span>
                        </>
                      )}
                    </div>
                    {/* Progress bar */}
                    {pcItems.length > 0 && (
                      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden w-48">
                        <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${pct}%` }}/>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-300 mt-1">
                      {tr('dibuatLabel', lang)} {new Date(pc.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {pc.accepted_at && ` · ${tr('diterimaLabel', lang)} ${new Date(pc.accepted_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Close / Reopen */}
                    {pc.status === 'active' && (
                      confirmCloseId === pc.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-500">{tr('tutupQuestion', lang)}</span>
                          <button onClick={() => closePC(pc.id)}
                            className="text-[10px] bg-red-500 text-white px-2 py-1 rounded-lg font-semibold">{tr('yes', lang)}</button>
                          <button onClick={() => setConfirmCloseId(null)}
                            className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-semibold">{tr('cancel', lang)}</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmCloseId(pc.id)} title={tr('tutupPettyCash', lang)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                          <Lock size={14}/>
                        </button>
                      )
                    )}
                    {pc.status === 'closed' && (
                      <button onClick={() => reopenPC(pc.id)} title={tr('bukaKembali', lang)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                        <Unlock size={14}/>
                      </button>
                    )}
                    {/* Delete */}
                    {confirmDeleteId === pc.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deletePC(pc.id)}
                          className="text-[10px] bg-red-500 text-white px-2 py-1 rounded-lg font-semibold">{tr('delete', lang)}</button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-semibold">{tr('cancel', lang)}</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(pc.id)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 size={14}/>
                      </button>
                    )}
                    {/* Expand */}
                    <button onClick={() => toggleExpand(pc.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                      {isExpanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
                    </button>
                  </div>
                </div>

                {/* Expanded items table */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {pcItems.length === 0 ? (
                      <p className="px-5 py-6 text-sm text-gray-400 text-center">
                        {pc.status === 'pending' ? tr('hostBelumMenerima', lang) : tr('belumAdaPengeluaran', lang)}
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 text-[10px] text-gray-400 uppercase tracking-widest border-b border-gray-100">
                              <th className="px-4 py-2.5 text-left font-bold">{tr('date', lang)}</th>
                              <th className="px-4 py-2.5 text-left font-bold">{tr('remarkCol', lang)}</th>
                              <th className="px-4 py-2.5 text-right font-bold">{tr('cashOutCol', lang)}</th>
                              <th className="px-4 py-2.5 text-right font-bold">{tr('sisaLabel', lang)}</th>
                              <th className="px-4 py-2.5 text-center font-bold">{tr('buktiCol', lang)}</th>
                              <th className="px-4 py-2.5 w-16"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {pcItems.map(item => {
                              runningBalance -= Number(item.cash_out)
                              return (
                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{fmtDate(item.tanggal)}</td>
                                  <td className="px-4 py-2.5 text-xs text-gray-700">{item.remark || '—'}</td>
                                  <td className="px-4 py-2.5 text-xs text-right font-semibold text-red-600">
                                    {formatCurrency(Number(item.cash_out))}
                                  </td>
                                  <td className={`px-4 py-2.5 text-xs text-right font-bold ${runningBalance < 0 ? 'text-red-500' : 'text-emerald-700'}`}>
                                    {formatCurrency(Math.max(0, runningBalance))}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    {item.receipt_url ? (
                                      <a href={item.receipt_url} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] text-brand-600 hover:underline">
                                        <ExternalLink size={10}/> {tr('view', lang)}
                                      </a>
                                    ) : <span className="text-gray-300 text-[10px]">—</span>}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-0.5 justify-end">
                                      <button onClick={() => {
                                        setEditItem(item)
                                        setEditItemForm({ tanggal: item.tanggal, remark: item.remark || '', cash_out: item.cash_out })
                                      }} className="p-1 rounded text-gray-300 hover:text-brand-600 transition-colors">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      </button>
                                      <button onClick={() => deleteItem(item)} className="p-1 rounded text-gray-300 hover:text-red-500 transition-colors">
                                        <Trash2 size={12}/>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {/* Add expense (superadmin can log directly) */}
                    {pc.status === 'active' && (
                      addingTo === pc.id ? (
                        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">{tr('tanggalReqLabel', lang)}</label>
                              <input type="date" value={newItem.tanggal}
                                onChange={e => setNewItem(r => ({ ...r, tanggal: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"/>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">{tr('cashOutRpReq', lang)}</label>
                              <CurrencyInput value={newItem.cash_out}
                                onChange={v => setNewItem(r => ({ ...r, cash_out: v }))}
                                placeholder="50.000"
                                className="flex-1 min-w-0 px-3 py-2 text-xs focus:outline-none"/>
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">{tr('remarkKeterangan', lang)}</label>
                            <input value={newItem.remark}
                              onChange={e => setNewItem(r => ({ ...r, remark: e.target.value }))}
                              placeholder={tr('ongkosOjekPlaceholder', lang)}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"/>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">{tr('buktiPembayaranOpsional', lang)}</label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <span className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 bg-white rounded-xl px-3 py-2 hover:bg-gray-50">
                                <Upload size={12}/> {newItemFile ? newItemFile.name : tr('pilihFoto', lang)}
                              </span>
                              <input type="file" accept="image/*,application/pdf" className="hidden"
                                onChange={e => setNewItemFile(e.target.files?.[0] || null)}/>
                            </label>
                            {newItemFile && (
                              <button onClick={() => setNewItemFile(null)} className="mt-1 flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600">
                                <X size={10}/> {tr('hapusFile', lang)}
                              </button>
                            )}
                          </div>
                          {addItemError && <p className="text-[11px] text-red-600">{addItemError}</p>}
                          {uploadProgress && <p className="text-[11px] text-blue-500">{uploadProgress}</p>}
                          <div className="flex gap-2">
                            <button onClick={() => { setAddingTo(null); setAddItemError(''); setNewItemFile(null) }}
                              className="px-4 py-2 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-100">
                              {tr('cancel', lang)}
                            </button>
                            <button onClick={() => addItem(pc)} disabled={addingItemSaving}
                              className="flex-1 bg-emerald-600 text-white py-2 rounded-xl text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60">
                              {addingItemSaving ? tr('saving', lang) : tr('simpanPengeluaran', lang)}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-5 py-3 border-t border-gray-50">
                          <button onClick={() => { setAddingTo(pc.id); setNewItem({ tanggal: todayStr(), remark: '', cash_out: 0 }); setAddItemError(''); setNewItemFile(null) }}
                            className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold hover:text-emerald-900 transition-colors">
                            <Plus size={13}/> {tr('tambahPengeluaran', lang)}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Edit item modal (superadmin) */}
      {editItem && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditItem(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-gray-900 text-sm">{tr('editPengeluaran', lang)}</p>
              <button onClick={() => setEditItem(null)}><X size={16} className="text-gray-400"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{tr('date', lang)}</label>
                <input type="date" value={editItemForm.tanggal} onChange={e => setEditItemForm(f => ({ ...f, tanggal: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{tr('remarkCol', lang)}</label>
                <input value={editItemForm.remark} onChange={e => setEditItemForm(f => ({ ...f, remark: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"/>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{tr('cashOutCol', lang)} (Rp)</label>
                <CurrencyInput value={editItemForm.cash_out} onChange={v => setEditItemForm(f => ({ ...f, cash_out: v }))}/>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditItem(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">{tr('cancel', lang)}</button>
              <button onClick={saveEditItem} disabled={savingItem}
                className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-60">
                {savingItem ? tr('saving', lang) : tr('save', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
