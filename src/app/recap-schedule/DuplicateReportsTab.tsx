'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { AlertTriangle, CheckCircle2, Trash2, RefreshCw, ImageOff } from 'lucide-react'

// live_reports has passed Supabase's default 1000-row cap, so this needs the
// same pager Client List uses -- see ClientsClient.tsx's fetchAllRows.
async function fetchAllRows(supabase: ReturnType<typeof createClient>, table: string, columns: string, orderBy: string) {
  const pageSize = 1000
  let from = 0
  const all: any[] = []
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).order(orderBy).range(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

interface DupRow {
  id: string; host_id: string; report_date: string; start_time: string | null
  brand: string | null; platform: string | null
  gmv: number; impression: number; viewer: number; trans: number; comment_count: number
  notes: string | null; slot_id: string | null; screenshot_url: string | null; created_at: string
}
interface DupGroup {
  key: string; hostName: string; report_date: string; start_time: string; month: string
  rows: DupRow[]
}

const METRICS: { key: keyof DupRow; label: string; fmt: (n: number) => string }[] = [
  { key: 'gmv', label: 'GMV', fmt: formatCurrency },
  { key: 'impression', label: 'Impresi', fmt: n => n.toLocaleString('id-ID') },
  { key: 'viewer', label: 'Viewer', fmt: n => n.toLocaleString('id-ID') },
  { key: 'trans', label: 'Trans', fmt: n => n.toLocaleString('id-ID') },
  { key: 'comment_count', label: 'Komentar', fmt: n => n.toLocaleString('id-ID') },
]

function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
function monthLabel(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
}
function fmtCreated(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) +
    ' ' + new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function DuplicateReportsTab() {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<DupGroup[]>([])
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set())
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set())
  // Per-group working state: which row id is picked to keep, and the
  // (possibly hand-edited) values that will be written to it.
  const [keepId, setKeepId] = useState<Record<string, string>>({})
  const [editVals, setEditVals] = useState<Record<string, Record<string, number>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<Record<string, string>>({})

  function load() {
    setLoading(true)
    const supabase = createClient()
    Promise.all([
      fetchAllRows(supabase, 'live_reports',
        'id, host_id, report_date, start_time, brand, platform, gmv, impression, viewer, trans, comment_count, notes, slot_id, screenshot_url, created_at',
        'report_date'),
      supabase.from('profiles').select('id, full_name').in('role', ['host', 'host_manager']).then(({ data }) => data || []),
    ]).then(([reports, hosts]) => {
      const hostName: Record<string, string> = {}
      hosts.forEach((h: any) => { hostName[h.id] = h.full_name })

      const byKey: Record<string, DupRow[]> = {}
      ;(reports as DupRow[]).forEach(r => {
        const k = `${r.host_id}|${r.report_date}|${(r.start_time || '').slice(0, 5)}`
        ;(byKey[k] ||= []).push(r)
      })
      const grouped: DupGroup[] = Object.entries(byKey)
        .filter(([, rows]) => rows.length > 1)
        .map(([key, rows]) => {
          const [hostId, report_date, start_time] = key.split('|')
          return {
            key, hostName: hostName[hostId] || 'Host tidak dikenal', report_date, start_time,
            month: report_date.slice(0, 7),
            rows: rows.sort((a, b) => a.created_at.localeCompare(b.created_at)),
          }
        })
        .sort((a, b) => b.report_date.localeCompare(a.report_date))

      setGroups(grouped)

      // Pre-select a recommended "keep" row where the signal is unambiguous:
      // exactly one row in the group has a real slot_id (the authentic
      // host-linked submission) -- still requires the admin to confirm.
      const defaults: Record<string, string> = {}
      grouped.forEach(g => {
        const withSlot = g.rows.filter(r => r.slot_id)
        if (withSlot.length === 1) defaults[g.key] = withSlot[0].id
      })
      setKeepId(defaults)
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const monthCounts = useMemo(() => {
    const m: Record<string, number> = {}
    groups.forEach(g => {
      if (resolvedKeys.has(g.key) || dismissedKeys.has(g.key)) return
      m[g.month] = (m[g.month] || 0) + 1
    })
    return m
  }, [groups, resolvedKeys, dismissedKeys])

  const visibleGroups = useMemo(() =>
    groups.filter(g => !resolvedKeys.has(g.key) && !dismissedKeys.has(g.key) && (monthFilter === 'all' || g.month === monthFilter)),
    [groups, resolvedKeys, dismissedKeys, monthFilter])

  function pickKeep(groupKey: string, rowId: string, rows: DupRow[]) {
    setKeepId(prev => ({ ...prev, [groupKey]: rowId }))
    const row = rows.find(r => r.id === rowId)!
    setEditVals(prev => ({
      ...prev,
      [groupKey]: Object.fromEntries(METRICS.map(m => [m.key, Number(row[m.key]) || 0])),
    }))
    setError(prev => ({ ...prev, [groupKey]: '' }))
  }

  function setEditVal(groupKey: string, metric: string, value: number) {
    setEditVals(prev => ({ ...prev, [groupKey]: { ...prev[groupKey], [metric]: value } }))
  }

  async function confirmGroup(g: DupGroup) {
    const keep = keepId[g.key]
    if (!keep) { setError(prev => ({ ...prev, [g.key]: 'Pilih dulu baris mana yang mau disimpan' })); return }
    setSaving(g.key); setError(prev => ({ ...prev, [g.key]: '' }))
    const supabase = createClient()
    const vals = editVals[g.key] || {}
    const { error: updErr } = await supabase.from('live_reports').update(vals).eq('id', keep)
    if (updErr) { setError(prev => ({ ...prev, [g.key]: updErr.message })); setSaving(null); return }
    const toDelete = g.rows.map(r => r.id).filter(id => id !== keep)
    if (toDelete.length) {
      const { error: delErr } = await supabase.from('live_reports').delete().in('id', toDelete)
      if (delErr) { setError(prev => ({ ...prev, [g.key]: delErr.message })); setSaving(null); return }
    }
    setSaving(null)
    setResolvedKeys(prev => new Set(prev).add(g.key))
  }

  function dismissGroup(key: string) {
    setDismissedKeys(prev => new Set(prev).add(key))
  }

  const totalPending = groups.length - resolvedKeys.size - dismissedKeys.size

  return (
    <div className="w-full space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500"/> Report Duplikat
            </p>
            <p className="text-xs text-gray-500">
              Sesi dengan host, tanggal, dan jam mulai yang sama tapi tersimpan lebih dari satu kali.
              Pilih baris mana yang benar (boleh diedit sebelum simpan), sisanya dihapus.
              Setelah selesai, halaman CSV Rekonsiliasi bisa dijalankan ulang untuk verifikasi.
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl px-3 py-2 disabled:opacity-50 flex-shrink-0">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''}/> Muat Ulang
          </button>
        </div>

        {!loading && groups.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-4">
            <button onClick={() => setMonthFilter('all')}
              className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-full border transition-colors ${
                monthFilter === 'all' ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'
              }`}>
              Semua Bulan · {totalPending}
            </button>
            {Object.entries(monthCounts).sort(([a], [b]) => b.localeCompare(a)).map(([m, count]) => (
              <button key={m} onClick={() => setMonthFilter(m)}
                className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-full border transition-colors ${
                  monthFilter === m ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'
                }`}>
                {monthLabel(m)} · {count}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-400">Memuat...</div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-2"/>
          <p className="text-sm font-medium text-gray-400">Tidak ada report duplikat</p>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-2"/>
          <p className="text-sm font-medium text-gray-400">Semua sudah diberesin untuk bulan ini</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map(g => {
            const chosen = keepId[g.key]
            const vals = editVals[g.key]
            const brands = Array.from(new Set(g.rows.map(r => r.brand || '—')))
            const brandsDiffer = brands.length > 1
            return (
              <div key={g.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {g.hostName} · {fmtDate(g.report_date)} · {g.start_time}
                      {!brandsDiffer && <span className="text-gray-400 font-medium"> · {brands[0]}</span>}
                    </p>
                    <p className="text-xs text-gray-400">{g.rows.length} baris untuk sesi yang sama</p>
                    {brandsDiffer && (
                      <p className="text-[11px] text-amber-600 font-semibold flex items-center gap-1 mt-0.5">
                        <AlertTriangle size={11}/> Brand berbeda ({brands.join(' vs ')}) — cek dulu, mungkin bukan duplikat
                      </p>
                    )}
                  </div>
                  <button onClick={() => dismissGroup(g.key)}
                    className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5">
                    Bukan Duplikat, Lewati
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
                  {g.rows.map(r => {
                    const isChosen = chosen === r.id
                    return (
                      <button key={r.id} onClick={() => pickKeep(g.key, r.id, g.rows)}
                        className={`text-left rounded-xl border-2 p-3.5 transition-colors ${
                          isChosen ? 'border-brand-500 bg-brand-50/40' : 'border-gray-100 hover:border-gray-200'
                        }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            r.notes === 'CSV' ? 'bg-purple-100 text-purple-700' : r.slot_id ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {r.notes === 'CSV' ? 'Dari CSV (tanpa slot)' : r.slot_id ? 'Terhubung ke Jadwal' : 'Tanpa Jadwal'}
                          </span>
                          {isChosen && <span className="text-[10px] font-bold text-brand-600 flex items-center gap-1"><CheckCircle2 size={12}/> Disimpan</span>}
                        </div>
                        <p className={`text-xs font-semibold mb-1.5 ${brandsDiffer ? 'text-amber-700' : 'text-gray-700'}`}>
                          {r.brand || '—'}{r.platform ? ` · ${r.platform}` : ''}
                        </p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-2">
                          {METRICS.map(m => (
                            <div key={m.key} className="flex justify-between">
                              <span className="text-gray-400">{m.label}</span>
                              <span className="font-semibold text-gray-800">{m.fmt(Number(r[m.key]) || 0)}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-gray-400">Dibuat {fmtCreated(r.created_at)}</p>
                        {r.notes && r.notes !== 'CSV' && (
                          <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2">{r.notes}</p>
                        )}
                        {r.screenshot_url ? (
                          <p className="text-[10px] text-emerald-600 mt-1.5 flex items-center gap-1">
                            <CheckCircle2 size={10}/> Ada screenshot
                          </p>
                        ) : (
                          <p className="text-[10px] text-gray-300 mt-1.5 flex items-center gap-1">
                            <ImageOff size={10}/> Tanpa screenshot
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>

                {chosen && vals && (
                  <div className="px-4 pb-4">
                    <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-3.5">
                      <p className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-2">
                        Nilai final untuk baris yang disimpan (bisa diedit)
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {METRICS.map(m => (
                          <div key={m.key}>
                            <label className="text-[10px] text-gray-400 block mb-0.5">{m.label}</label>
                            <input type="number" value={vals[m.key] ?? 0}
                              onChange={e => setEditVal(g.key, m.key, Number(e.target.value) || 0)}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"/>
                            {/* Quick-fill chips for whatever the OTHER row(s) had, since GMV is
                                usually the only field that actually differs between duplicates. */}
                            {g.rows.filter(r => r.id !== chosen).map(r => Number(r[m.key]) || 0)
                              .filter((v, i, arr) => v !== vals[m.key] && arr.indexOf(v) === i)
                              .map(v => (
                                <button key={v} onClick={() => setEditVal(g.key, m.key, v)}
                                  className="text-[9px] text-brand-500 hover:text-brand-700 underline mt-0.5 block">
                                  pakai {m.fmt(v)}
                                </button>
                              ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="px-4 pb-4 flex items-center justify-between gap-3">
                  {error[g.key] ? <p className="text-xs text-red-600">{error[g.key]}</p> : <span/>}
                  <button onClick={() => confirmGroup(g)} disabled={!chosen || saving === g.key}
                    className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-semibold px-3.5 py-2 rounded-xl hover:bg-red-700 disabled:opacity-40 transition-colors">
                    <Trash2 size={12}/> {saving === g.key ? 'Menyimpan...' : `Hapus ${g.rows.length - 1} Duplikat`}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
