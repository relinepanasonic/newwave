'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Wallet, Plus, Trash2, Upload, ExternalLink, X, Check } from 'lucide-react'

interface PC {
  id: string; cash_id: string; amount: number; notes: string | null
  status: 'pending' | 'active' | 'closed'; created_at: string; accepted_at: string | null
}
interface PCItem {
  id: string; petty_cash_id: string; tanggal: string; remark: string | null
  cash_out: number; receipt_url: string | null; created_at: string
}

function fmtDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
function toInputDate(s: string) { return s }
function todayStr() { return new Date().toISOString().split('T')[0] }

const STATUS_LABEL: Record<string, string> = {
  pending: 'Menunggu Konfirmasimu',
  active:  'Aktif',
  closed:  'Selesai',
}

export default function PettyCashHostPanel({ profile }: { profile: any }) {
  const [pcs, setPcs] = useState<PC[]>([])
  const [items, setItems] = useState<Record<string, PCItem[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Add new item
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [newRow, setNewRow] = useState({ tanggal: todayStr(), remark: '', cash_out: '' })
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [savingRow, setSavingRow] = useState(false)
  const [rowError, setRowError] = useState('')

  // Upload
  const [uploadProgress, setUploadProgress] = useState('')

  const load = useCallback(async () => {
    const { data } = await createClient().from('petty_cash')
      .select('*').order('created_at', { ascending: false })
    setPcs((data as PC[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function loadItems(pcId: string) {
    const { data } = await createClient().from('petty_cash_items')
      .select('*').eq('petty_cash_id', pcId).order('tanggal').order('created_at')
    setItems(prev => ({ ...prev, [pcId]: (data as PCItem[]) || [] }))
  }

  function toggleExpand(pc: PC) {
    if (expanded === pc.id) { setExpanded(null); return }
    setExpanded(pc.id)
    if (pc.status !== 'pending') loadItems(pc.id)
  }

  async function acceptPC(pc: PC) {
    const { error } = await createClient().from('petty_cash')
      .update({ status: 'active', accepted_at: new Date().toISOString() }).eq('id', pc.id)
    if (!error) {
      setPcs(prev => prev.map(p => p.id === pc.id ? { ...p, status: 'active', accepted_at: new Date().toISOString() } : p))
      setExpanded(pc.id)
      loadItems(pc.id)
    }
  }

  async function deleteItem(item: PCItem) {
    await createClient().from('petty_cash_items').delete().eq('id', item.id)
    setItems(prev => ({
      ...prev,
      [item.petty_cash_id]: (prev[item.petty_cash_id] || []).filter(i => i.id !== item.id),
    }))
  }

  async function addItem(pc: PC) {
    const cashOut = Number(newRow.cash_out)
    if (!newRow.tanggal || isNaN(cashOut) || cashOut <= 0) {
      setRowError('Isi tanggal dan jumlah pengeluaran'); return
    }
    setSavingRow(true); setRowError(''); setUploadProgress('')

    let receiptUrl: string | null = null

    // Upload receipt if provided
    if (receiptFile) {
      setUploadProgress('Mengunggah bukti...')
      const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      try {
        const b64 = await toBase64(receiptFile)
        const res = await fetch('/api/petty-cash/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host_name: profile.full_name,
            cash_id: pc.cash_id,
            filename: receiptFile.name,
            mime: receiptFile.type,
            base64: b64,
          }),
        })
        const json = await res.json()
        if (json.fileUrl) receiptUrl = json.fileUrl
      } catch { /* Drive upload failure is non-fatal */ }
      setUploadProgress('')
    }

    const { data, error } = await createClient().from('petty_cash_items').insert({
      petty_cash_id: pc.id,
      tanggal: newRow.tanggal,
      remark: newRow.remark || null,
      cash_out: cashOut,
      receipt_url: receiptUrl,
    }).select().single()

    if (error) { setRowError(error.message); setSavingRow(false); return }

    const pcItems = [...(items[pc.id] || []), data as PCItem]
    setItems(prev => ({ ...prev, [pc.id]: pcItems }))

    // Auto-close if balance exhausted
    const spent = pcItems.reduce((s, i) => s + Number(i.cash_out), 0)
    if (spent >= Number(pc.amount)) {
      await createClient().from('petty_cash')
        .update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', pc.id)
      setPcs(prev => prev.map(p => p.id === pc.id ? { ...p, status: 'closed' } : p))
    }

    setNewRow({ tanggal: todayStr(), remark: '', cash_out: '' })
    setReceiptFile(null)
    setAddingTo(null)
    setSavingRow(false)
  }

  const pending = pcs.filter(p => p.status === 'pending')
  const active  = pcs.filter(p => p.status === 'active')
  const closed  = pcs.filter(p => p.status === 'closed')

  if (loading) return null
  if (pcs.length === 0) return null

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Wallet size={16} className="text-amber-600"/>
        <h2 className="font-bold text-gray-800 text-sm">Petty Cash</h2>
      </div>

      {/* Pending notification */}
      {pending.map(pc => (
        <div key={pc.id}
          className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
            <Wallet size={15} className="text-amber-600"/>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-amber-900 text-sm">Dana Operasional Dikirim ke Kamu</p>
            <p className="text-xs text-amber-700 mt-0.5">
              <span className="font-mono font-bold">{pc.cash_id}</span>
              {' · '}Nominal: <strong>{formatCurrency(Number(pc.amount))}</strong>
            </p>
            {pc.notes && <p className="text-xs text-amber-600 mt-0.5">Keperluan: {pc.notes}</p>}
            <button onClick={() => acceptPC(pc)}
              className="mt-2.5 flex items-center gap-1.5 bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-amber-700 transition-colors shadow-sm">
              <Check size={12}/> Terima Petty Cash
            </button>
          </div>
        </div>
      ))}

      {/* Active */}
      {active.map(pc => {
        const pcItems = items[pc.id] || []
        const spent = pcItems.reduce((s, i) => s + Number(i.cash_out), 0)
        const remaining = Math.max(0, Number(pc.amount) - spent)
        const pct = Math.min(100, Math.round((spent / Number(pc.amount)) * 100))
        const isExpanded = expanded === pc.id
        let runBalance = Number(pc.amount)
        return (
          <div key={pc.id} className="mb-3 bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
            <button onClick={() => toggleExpand(pc)}
              className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-emerald-700">{pc.cash_id}</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Aktif</span>
                </div>
                {pc.notes && <p className="text-xs text-gray-400 mt-0.5">{pc.notes}</p>}
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-gray-500">Sisa: <span className="font-bold text-emerald-700">{formatCurrency(remaining)}</span></span>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-400">dari {formatCurrency(Number(pc.amount))}</span>
                </div>
                <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden w-40">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }}/>
                </div>
              </div>
              <span className="text-gray-300 text-xs">{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100">
                {/* Items table */}
                {pcItems.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-4 py-2.5 text-left text-[10px] text-gray-400 font-bold uppercase tracking-widest">Tanggal</th>
                          <th className="px-4 py-2.5 text-left text-[10px] text-gray-400 font-bold uppercase tracking-widest">Remark</th>
                          <th className="px-4 py-2.5 text-right text-[10px] text-gray-400 font-bold uppercase tracking-widest">Cash Out</th>
                          <th className="px-4 py-2.5 text-right text-[10px] text-gray-400 font-bold uppercase tracking-widest">Total Sisa</th>
                          <th className="px-4 py-2.5 text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest">Bukti</th>
                          <th className="w-8 px-2"/>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {pcItems.map(item => {
                          runBalance -= Number(item.cash_out)
                          return (
                            <tr key={item.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(item.tanggal)}</td>
                              <td className="px-4 py-2.5 text-gray-700">{item.remark || '—'}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-red-600">{formatCurrency(Number(item.cash_out))}</td>
                              <td className={`px-4 py-2.5 text-right font-bold ${runBalance < 0 ? 'text-red-500' : 'text-emerald-700'}`}>
                                {formatCurrency(Math.max(0, runBalance))}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {item.receipt_url ? (
                                  <a href={item.receipt_url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 text-[10px] text-brand-600 hover:underline">
                                    <ExternalLink size={10}/> Lihat
                                  </a>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-2 py-2.5">
                                <button onClick={() => deleteItem(item)}
                                  className="text-gray-200 hover:text-red-400 transition-colors">
                                  <Trash2 size={12}/>
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add form */}
                {addingTo === pc.id ? (
                  <div className="px-4 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Tanggal *</label>
                        <input type="date" value={newRow.tanggal}
                          onChange={e => setNewRow(r => ({ ...r, tanggal: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"/>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Cash Out (Rp) *</label>
                        <input type="number" min="1" value={newRow.cash_out}
                          onChange={e => setNewRow(r => ({ ...r, cash_out: e.target.value }))}
                          placeholder="50000"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"/>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Remark / Keterangan</label>
                      <input value={newRow.remark}
                        onChange={e => setNewRow(r => ({ ...r, remark: e.target.value }))}
                        placeholder="Ongkos ojek ke lokasi"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"/>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Bukti Pembayaran (opsional)</label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 bg-white rounded-xl px-3 py-2 hover:bg-gray-50">
                          <Upload size={12}/> {receiptFile ? receiptFile.name : 'Pilih Foto'}
                        </span>
                        <input type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => setReceiptFile(e.target.files?.[0] || null)}/>
                      </label>
                      {receiptFile && (
                        <button onClick={() => setReceiptFile(null)} className="mt-1 flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600">
                          <X size={10}/> Hapus file
                        </button>
                      )}
                    </div>
                    {rowError && <p className="text-[11px] text-red-600">{rowError}</p>}
                    {uploadProgress && <p className="text-[11px] text-blue-500">{uploadProgress}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => { setAddingTo(null); setRowError(''); setReceiptFile(null) }}
                        className="px-4 py-2 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-100">
                        Batal
                      </button>
                      <button onClick={() => addItem(pc)} disabled={savingRow}
                        className="flex-1 bg-emerald-600 text-white py-2 rounded-xl text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60">
                        {savingRow ? 'Menyimpan...' : 'Simpan Pengeluaran'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3 border-t border-gray-50">
                    <button onClick={() => { setAddingTo(pc.id); setNewRow({ tanggal: todayStr(), remark: '', cash_out: '' }); setRowError(''); setReceiptFile(null) }}
                      className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold hover:text-emerald-900 transition-colors">
                      <Plus size={13}/> Tambah Pengeluaran
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Closed (collapsed by default) */}
      {closed.map(pc => {
        const pcItems = items[pc.id] || []
        const spent = pcItems.reduce((s, i) => s + Number(i.cash_out), 0)
        const isExpanded = expanded === pc.id
        let runBalance = Number(pc.amount)
        return (
          <div key={pc.id} className="mb-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button onClick={() => toggleExpand(pc)}
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-gray-400">{pc.cash_id}</span>
                  <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-bold">Selesai</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatCurrency(Number(pc.amount))} · {pcItems.length || '?'} pengeluaran
                  {pc.notes && ` · ${pc.notes}`}
                </p>
              </div>
              <span className="text-gray-300 text-xs">{isExpanded ? '▲' : '▼'}</span>
            </button>
            {isExpanded && (
              <div className="border-t border-gray-100">
                {pcItems.length === 0 && <p className="px-4 py-4 text-xs text-gray-400">Tidak ada pengeluaran tercatat.</p>}
                {pcItems.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-4 py-2 text-left text-[10px] text-gray-400 font-bold">Tanggal</th>
                          <th className="px-4 py-2 text-left text-[10px] text-gray-400 font-bold">Remark</th>
                          <th className="px-4 py-2 text-right text-[10px] text-gray-400 font-bold">Cash Out</th>
                          <th className="px-4 py-2 text-right text-[10px] text-gray-400 font-bold">Sisa</th>
                          <th className="px-4 py-2 text-center text-[10px] text-gray-400 font-bold">Bukti</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {pcItems.map(item => {
                          runBalance -= Number(item.cash_out)
                          return (
                            <tr key={item.id}>
                              <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmtDate(item.tanggal)}</td>
                              <td className="px-4 py-2 text-gray-600">{item.remark || '—'}</td>
                              <td className="px-4 py-2 text-right text-gray-600">{formatCurrency(Number(item.cash_out))}</td>
                              <td className="px-4 py-2 text-right text-gray-400">{formatCurrency(Math.max(0, runBalance))}</td>
                              <td className="px-4 py-2 text-center">
                                {item.receipt_url ? (
                                  <a href={item.receipt_url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 text-[10px] text-brand-600 hover:underline">
                                    <ExternalLink size={10}/> Lihat
                                  </a>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
