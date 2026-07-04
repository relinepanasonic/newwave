'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/AppShell'

const API_URL = process.env.NEXT_PUBLIC_PROONE_API_URL ?? 'https://prooneaccounting.vercel.app/api/v1'
const API_KEY = process.env.NEXT_PUBLIC_PROONE_API_KEY ?? ''

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Math.round(n))
}

function Card({ label, value, sub, green, red }: { label: string; value: string; sub?: string; green?: boolean; red?: boolean }) {
  const color = green ? 'text-emerald-400' : red ? 'text-red-400' : 'text-white'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function AccountingClient({ profile }: { profile: any }) {
  const now   = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [pl, setPl]       = useState<any>(null)
  const [bs, setBs]       = useState<any>(null)
  const [cf, setCf]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!API_KEY) { setError('NEXT_PUBLIC_PROONE_API_KEY belum diset'); setLoading(false); return }
    setLoading(true); setError('')
    const headers = { Authorization: `Bearer ${API_KEY}` }
    const params  = `?year=${year}&month=${month}`
    Promise.all([
      fetch(`${API_URL}/reports/pl${params}`, { headers }).then(r => r.json()),
      fetch(`${API_URL}/reports/balance-sheet${params}`, { headers }).then(r => r.json()),
      fetch(`${API_URL}/reports/cash-flow${params}`, { headers }).then(r => r.json()),
    ]).then(([plD, bsD, cfD]) => {
      setPl(plD.success ? plD.data : null)
      setBs(bsD.success ? bsD.data : null)
      setCf(cfD.success ? cfD.data : null)
      if (!plD.success) setError(plD.error ?? 'Gagal memuat laporan')
    }).catch(() => setError('Tidak dapat terhubung ke Proone Accounting'))
      .finally(() => setLoading(false))
  }, [year, month])

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Accounting</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Laporan keuangan dari Proone Accounting — {MONTHS[month-1]} {year}
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-600">
            ⚠ {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 h-20 animate-pulse" />
            ))}
          </div>
        ) : pl ? (
          <div className="space-y-6">
            {/* P&L */}
            <section>
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Laba Rugi</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card label="Pendapatan"   value={fmtRp(pl.revenue?.total ?? 0)} sub={`${pl.revenue?.invoiceCount ?? 0} invoice lunas`} green />
                <Card label="Pengeluaran"  value={fmtRp(pl.expenses?.total ?? 0)} red />
                <Card label="Laba Kotor"   value={fmtRp(pl.summary?.grossProfit ?? 0)} green={(pl.summary?.grossProfit ?? 0) >= 0} red={(pl.summary?.grossProfit ?? 0) < 0} />
                <Card label="Laba Bersih"  value={fmtRp(pl.summary?.netProfit ?? 0)} sub={`PPN: ${fmtRp(pl.summary?.ppnDue ?? 0)}`} green={(pl.summary?.netProfit ?? 0) >= 0} red={(pl.summary?.netProfit ?? 0) < 0} />
              </div>

              {pl.expenses?.byCategory && Object.keys(pl.expenses.byCategory).length > 0 && (
                <div className="mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Rincian Pengeluaran</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(pl.expenses.byCategory as Record<string, number>).map(([cat, amt]) => (
                      <div key={cat} className="bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 text-xs">
                        <span className="text-gray-500">{cat}:</span>{' '}
                        <span className="font-bold text-red-600">{fmtRp(amt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Balance Sheet */}
            {bs && (
              <section>
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Neraca</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card label="Total Aset"      value={fmtRp(bs.assets?.total ?? 0)} sub={`Kas: ${fmtRp(bs.assets?.cash ?? 0)}`} />
                  <Card label="Piutang (AR)"    value={fmtRp(bs.assets?.accountsReceivable ?? 0)} sub={`${bs.assets?.unpaidInvoices ?? 0} invoice belum lunas`} />
                  <Card label="Total Kewajiban" value={fmtRp(bs.liabilities?.total ?? 0)} red />
                  <Card label="Ekuitas"         value={fmtRp(bs.equity?.total ?? 0)} green={(bs.equity?.total ?? 0) >= 0} />
                </div>
              </section>
            )}

            {/* Cash Flow */}
            {cf && (
              <section>
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Arus Kas</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card label="Kas Masuk"   value={fmtRp(cf.operating?.inflows ?? 0)} green />
                  <Card label="Kas Keluar"  value={fmtRp(cf.operating?.outflows ?? 0)} red />
                  <Card label="Arus Bersih" value={fmtRp(cf.operating?.net ?? 0)} green={(cf.operating?.net ?? 0) >= 0} red={(cf.operating?.net ?? 0) < 0} />
                  <Card label="Saldo Akhir" value={fmtRp(cf.balances?.closing ?? 0)} sub={`Awal: ${fmtRp(cf.balances?.opening ?? 0)}`} />
                </div>
              </section>
            )}
          </div>
        ) : !error ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center text-gray-400">
            <p className="text-sm">Tidak ada data untuk periode ini</p>
          </div>
        ) : null}
      </div>
    </AppShell>
  )
}
