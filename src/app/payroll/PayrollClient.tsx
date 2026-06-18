'use client'
import { useState, useMemo } from 'react'
import AppShell from '@/components/AppShell'
import { formatCurrency, getPayPeriod } from '@/lib/utils'
import { Download, FileText } from 'lucide-react'
import { tr, type Lang } from '@/lib/i18n'

interface PayRow {
  host_id: string; full_name: string; hourly_rate: number
  period_start: string; total_hours: number; total_salary: number; session_count: number
}
interface Host { id: string; full_name: string; hourly_rate: number }
interface Props {
  profile: { full_name: string; role: string }
  summary: PayRow[]
  hosts: Host[]
}

function periodLabel(start: string): string {
  const s = new Date(start)
  const e = new Date(s)
  e.setMonth(e.getMonth() + 1)
  e.setDate(20)
  return `${s.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} – ${e.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export default function PayrollClient({ profile, summary, hosts }: Props) {
  const [lang] = useState<Lang>('id')
  const currentPeriod = getPayPeriod()
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod.start.toISOString().split('T')[0].slice(0, 7))

  const periods = useMemo(() => {
    const ps = Array.from(new Set(summary.map(r => r.period_start.slice(0, 7))))
    if (!ps.includes(selectedPeriod)) ps.unshift(selectedPeriod)
    return ps.sort().reverse()
  }, [summary, selectedPeriod])

  const filtered = summary.filter(r => r.period_start.slice(0, 7) === selectedPeriod)
  const totalPay = filtered.reduce((s, r) => s + Number(r.total_salary), 0)
  const totalHours = filtered.reduce((s, r) => s + Number(r.total_hours), 0)

  async function exportExcel() {
    const { utils, writeFile } = await import('xlsx')
    const ws = utils.json_to_sheet(filtered.map(r => ({
      'Nama Host': r.full_name,
      'Tarif/Jam': r.hourly_rate,
      'Total Jam': Number(r.total_hours).toFixed(2),
      'Sesi': r.session_count,
      'Total Gaji': Number(r.total_salary),
      'Periode': periodLabel(r.period_start),
    })))
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Payroll')
    writeFile(wb, `Payroll_${selectedPeriod}.xlsx`)
  }

  async function exportPDF(host: PayRow) {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text('New Wave Live Specialist', 14, 20)
    doc.setFontSize(11)
    doc.text('Slip Gaji / Payslip', 14, 30)
    doc.text(`Nama: ${host.full_name}`, 14, 42)
    doc.text(`Periode: ${periodLabel(host.period_start)}`, 14, 50)
    doc.text(`Tarif/Jam: ${formatCurrency(host.hourly_rate)}`, 14, 58)
    autoTable(doc, {
      startY: 68,
      head: [['Keterangan', 'Nilai']],
      body: [
        ['Total Sesi', String(host.session_count)],
        ['Total Jam Kerja', `${Number(host.total_hours).toFixed(2)} jam`],
        ['Tarif per Jam', formatCurrency(host.hourly_rate)],
        ['Total Gaji', formatCurrency(Number(host.total_salary))],
      ],
      theme: 'grid',
      headStyles: { fillColor: [109, 40, 217] },
    })
    doc.save(`Payslip_${host.full_name.replace(' ', '_')}_${selectedPeriod}.pdf`)
  }

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tr('payroll', lang)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Periode: 21 – 20 tiap bulan</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedPeriod}
              onChange={e => setSelectedPeriod(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {periods.map(p => (
                <option key={p} value={p}>{periodLabel(p + '-21')}</option>
              ))}
            </select>
            <button
              onClick={exportExcel}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              <Download size={14}/>
              {tr('downloadExcel', lang)}
            </button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Host', value: filtered.length, suffix: '' },
            { label: 'Total Jam', value: totalHours.toFixed(1), suffix: ' jam' },
            { label: 'Total Gaji', value: formatCurrency(totalPay), suffix: '' },
          ].map(({ label, value, suffix }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
              <p className="text-xl font-bold text-gray-900">{value}{suffix}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              Belum ada data gaji untuk periode ini
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-semibold">Nama Host</th>
                  <th className="px-4 py-3 text-right font-semibold">Sesi</th>
                  <th className="px-4 py-3 text-right font-semibold">Jam Kerja</th>
                  <th className="px-4 py-3 text-right font-semibold">Tarif/Jam</th>
                  <th className="px-4 py-3 text-right font-semibold">Total Gaji</th>
                  <th className="px-4 py-3 text-center font-semibold">Payslip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(row => (
                  <tr key={row.host_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-900">{row.full_name}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{row.session_count}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{Number(row.total_hours).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(row.hourly_rate)}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(Number(row.total_salary))}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => exportPDF(row)}
                        className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 font-medium border border-brand-200 rounded-lg px-2.5 py-1 hover:bg-brand-50 transition-colors"
                      >
                        <FileText size={12}/>
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  )
}
