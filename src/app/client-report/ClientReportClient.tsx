'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import AppShell from '@/components/AppShell'
import { FileBarChart2, Download, Presentation, Filter } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { tagSessions, computeSessionTimeEval, computeMoM, totalsOf, rankLabel } from './reportUtils'

const PLATFORMS = ['TikTok', 'Shopee', 'Instagram', 'YouTube', 'Other']
const BRAND_PURPLE = [124, 58, 237] as [number, number, number]
const PPTXGENJS_CDN_URL = 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js'

// pptxgenjs's npm build references Node built-ins (fs/https) that break the
// webpack client bundle even behind a dynamic import, so it's loaded via its
// official browser bundle from CDN instead, matching pptxgenjs's own docs.
function loadPptxGenCtor(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any
    if (w.PptxGenJS) { resolve(w.PptxGenJS); return }
    const script = document.createElement('script')
    script.src = PPTXGENJS_CDN_URL
    script.onload = () => resolve(w.PptxGenJS)
    script.onerror = () => reject(new Error('Gagal memuat pustaka PPT'))
    document.head.appendChild(script)
  })
}

interface ReportRow {
  id: string; report_date: string; brand: string | null; platform: string | null
  start_time: string | null; duration_hours: number | null
  gmv: number; impression: number; viewer: number; trans: number; comment_count: number
  product_sold_name: string | null; notes: string | null
  host_id: string | null; profiles: { full_name: string } | null
}
interface ProductRow {
  id: string; live_report_id: string; produk_terjual: string
  product_klik: number; item_sold: number; total: number
}
interface ClientOption { id: string; full_name: string; client_brand: string }

// All 12 months of the current year, January through December.
function getMonthOptions() {
  const y = new Date().getFullYear()
  return Array.from({ length: 12 }, (_, m) => {
    const d = new Date(y, m, 1)
    return {
      label: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
      start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      end: `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}`,
    }
  })
}

// Calendar month immediately before the given YYYY-MM-01 start date.
function prevMonthRange(monthStart: string): { start: string; end: string } {
  const [y, m] = monthStart.split('-').map(Number)
  const prevY = m === 1 ? y - 1 : y
  const prevM = m === 1 ? 12 : m - 1
  return {
    start: `${prevY}-${String(prevM).padStart(2, '0')}-01`,
    end: `${prevY}-${String(prevM).padStart(2, '0')}-${new Date(prevY, prevM, 0).getDate()}`,
  }
}

function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0)
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return (n || 0).toString()
}
function fmtDateShort(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}
function fmtDateFull(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ClientReportClient({ profile }: { profile: any }) {
  const isClientRole = profile.role === 'client'
  const monthOptions = getMonthOptions()

  const [monthIdx, setMonthIdx] = useState(() => new Date().getMonth())
  const [platform, setPlatform] = useState('')
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [selectedBrand, setSelectedBrand] = useState('')
  const [reports, setReports] = useState<ReportRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [prevReports, setPrevReports] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [exporting, setExporting] = useState<'pdf' | 'ppt' | null>(null)

  const month = monthOptions[monthIdx]
  const brand = isClientRole ? profile.client_brand : selectedBrand

  // Admin-like roles: fetch the client brand picker options
  useEffect(() => {
    if (isClientRole) return
    fetch('/api/client-report/clients').then(r => r.json()).then(json => {
      setClientOptions(json.clients || [])
    })
  }, [isClientRole])

  const fetchReport = useCallback(async () => {
    if (!brand) { setReports([]); setProducts([]); setPrevReports([]); return }
    setLoading(true); setLoadError('')
    try {
      const prevMonth = prevMonthRange(month.start)
      const [res, prevRes] = await Promise.all([
        fetch('/api/client-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand, platform: platform || undefined, month_start: month.start, month_end: month.end }),
        }),
        fetch('/api/client-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand, platform: platform || undefined, month_start: prevMonth.start, month_end: prevMonth.end }),
        }),
      ])
      const json = await res.json()
      const prevJson = await prevRes.json()
      if (!res.ok) { setLoadError(json.error || 'Gagal memuat data'); setReports([]); setProducts([]); setPrevReports([]); return }
      setReports(json.reports || [])
      setProducts(json.products || [])
      setPrevReports(prevRes.ok ? (prevJson.reports || []) : [])
    } catch {
      setLoadError('Gagal memuat data')
    }
    setLoading(false)
  }, [brand, platform, month.start, month.end])

  useEffect(() => { fetchReport() }, [fetchReport])

  // ── Aggregations ──────────────────────────────────────────────────────────
  const productsByReport = useMemo(() => {
    const map: Record<string, ProductRow[]> = {}
    products.forEach(p => { (map[p.live_report_id] ||= []).push(p) })
    return map
  }, [products])

  const totalGmv = reports.reduce((s, r) => s + (r.gmv || 0), 0)
  const totalViewer = reports.reduce((s, r) => s + (r.viewer || 0), 0)
  const totalTrans = reports.reduce((s, r) => s + (r.trans || 0), 0)
  const totalComment = reports.reduce((s, r) => s + (r.comment_count || 0), 0)
  const sessionCount = reports.length

  const dailyTrend = useMemo(() => {
    const map: Record<string, number> = {}
    reports.forEach(r => { map[r.report_date] = (map[r.report_date] || 0) + (r.gmv || 0) })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, gmv]) => ({ date, label: fmtDateShort(date), gmv }))
  }, [reports])

  const hostEval = useMemo(() => {
    const map: Record<string, { name: string; sessions: number; totalGmv: number; totalViewer: number; totalTrans: number; totalComment: number }> = {}
    reports.forEach(r => {
      const name = r.profiles?.full_name || 'Tanpa Host'
      const key = r.host_id || name
      if (!map[key]) map[key] = { name, sessions: 0, totalGmv: 0, totalViewer: 0, totalTrans: 0, totalComment: 0 }
      map[key].sessions += 1
      map[key].totalGmv += r.gmv || 0
      map[key].totalViewer += r.viewer || 0
      map[key].totalTrans += r.trans || 0
      map[key].totalComment += r.comment_count || 0
    })
    return Object.values(map)
      .map(h => ({ ...h, avgGmv: h.sessions ? h.totalGmv / h.sessions : 0, cvr: h.totalViewer ? (h.totalTrans / h.totalViewer) * 100 : 0 }))
      .sort((a, b) => b.totalGmv - a.totalGmv)
      .map((h, i) => ({ ...h, rank: rankLabel(i) }))
  }, [reports])

  // Best Session / Twindate / Payday — auto-detected, no manual tagging.
  const sessionTags = useMemo(() => tagSessions(reports), [reports])

  // Performance grouped by Start Live hour.
  const sessionTimeEval = useMemo(() => computeSessionTimeEval(reports), [reports])

  // This month vs last calendar month, same brand/platform.
  const momMetrics = useMemo(() => computeMoM(totalsOf(reports), totalsOf(prevReports)), [reports, prevReports])
  const prevMonthLabel = useMemo(() => {
    const [y, m] = month.start.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  }, [month.start])

  const productBreakdown = useMemo(() => {
    const map: Record<string, { name: string; klik: number; itemSold: number; total: number }> = {}
    products.forEach(p => {
      if (!map[p.produk_terjual]) map[p.produk_terjual] = { name: p.produk_terjual, klik: 0, itemSold: 0, total: 0 }
      map[p.produk_terjual].klik += p.product_klik || 0
      map[p.produk_terjual].itemSold += p.item_sold || 0
      map[p.produk_terjual].total += p.total || 0
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [products])

  const topHost = hostEval[0]
  const topProduct = productBreakdown[0]
  const platformLabel = platform || 'Semua Platform'

  const periodRangeLabel = reports.length
    ? `${fmtDateShort(reports[0].report_date)} – ${fmtDateFull(reports[reports.length - 1].report_date)}`
    : month.label

  const execSummary = reports.length
    ? `Selama periode ${periodRangeLabel}, New Wave Live Specialist melaksanakan ${sessionCount} sesi live ${platform || ''} untuk ${brand}. ` +
      `Total GMV yang dibukukan sebesar ${fmtRp(totalGmv)} dengan ${totalTrans} transaksi, ${fmtNum(totalViewer)} viewers, dan ${totalComment} komentar.`
    : ''

  const fileBase = `${platform || 'Report'}_${brand || ''}_${month.label}`.replace(/\s+/g, '_')

  // ── PDF export ────────────────────────────────────────────────────────────
  async function exportPdf() {
    if (!reports.length) return
    setExporting('pdf')
    try {
      const { default: jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      let y = 20

      doc.setFontSize(9); doc.setTextColor(140)
      doc.text('LIVE SHOPPING SPECIALIST', 14, 12)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(20)
      doc.text(`${platformLabel.toUpperCase()} PERFORMANCE REPORT`, 14, 20)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
      doc.text(String(brand), 14, 28)
      doc.setFontSize(9); doc.setTextColor(100)
      doc.text(`Periode: ${month.label}`, 14, 34)
      doc.text(`Platform: ${platformLabel} | Periode Aktif: ${periodRangeLabel} | ${sessionCount} Sesi`, 14, 39)

      y = 48
      doc.setDrawColor(220); doc.line(14, y, pageWidth - 14, y); y += 8

      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20)
      doc.text('Executive Summary', 14, y); y += 6
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60)
      const summaryLines = doc.splitTextToSize(execSummary, pageWidth - 28)
      doc.text(summaryLines, 14, y); y += summaryLines.length * 4.5 + 6

      autoTable(doc, {
        startY: y,
        body: [
          ['Total GMV', fmtRp(totalGmv)],
          ['Total Viewers', fmtNum(totalViewer)],
          ['Total Transaksi', String(totalTrans)],
          ['Total Komentar', String(totalComment)],
          ['Sesi Live', String(sessionCount)],
          ...(topHost ? [['Top Host', `${topHost.name} — ${fmtRp(topHost.totalGmv)}`]] : []),
          ...(topProduct ? [['Top Produk', `${topProduct.name} — ${fmtRp(topProduct.total)}`]] : []),
        ],
        theme: 'plain',
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: 'bold', textColor: [90, 90, 90] }, 1: { halign: 'right', fontStyle: 'bold', textColor: [16, 110, 80] } },
      })
      y = (doc as any).lastAutoTable.finalY + 10

      if (dailyTrend.length) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20)
        doc.text('Daily GMV Trend', 14, y); y += 6
        const chartH = 32, chartW = pageWidth - 28
        const maxGmv = Math.max(...dailyTrend.map(d => d.gmv), 1)
        const barW = chartW / dailyTrend.length
        dailyTrend.forEach((d, i) => {
          const h = (d.gmv / maxGmv) * chartH
          doc.setFillColor(...BRAND_PURPLE)
          doc.rect(14 + i * barW, y + (chartH - h), Math.max(barW * 0.7, 1), h, 'F')
        })
        y += chartH + 10
      }

      if (y > 250) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20)
      doc.text('Session Log', 14, y); y += 4
      autoTable(doc, {
        startY: y,
        head: [['Tanggal', 'Jam', 'Host', 'GMV', 'Viewer', 'Trans', 'Komentar']],
        body: reports.map(r => [
          fmtDateShort(r.report_date), r.start_time?.slice(0, 5) || '-', r.profiles?.full_name || '-',
          fmtRp(r.gmv), String(r.viewer || 0), String(r.trans || 0), String(r.comment_count || 0),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: BRAND_PURPLE },
      })
      y = (doc as any).lastAutoTable.finalY + 10

      if (y > 250) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.text('Host Evaluation', 14, y); y += 4
      autoTable(doc, {
        startY: y,
        head: [['Host', 'Sesi', 'Total GMV', 'Avg GMV/Sesi', 'Viewer', 'Trans', 'CVR', 'Komentar']],
        body: hostEval.map(h => [h.name, String(h.sessions), fmtRp(h.totalGmv), fmtRp(h.avgGmv), String(h.totalViewer), String(h.totalTrans), `${h.cvr.toFixed(2)}%`, String(h.totalComment)]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: BRAND_PURPLE },
      })
      y = (doc as any).lastAutoTable.finalY + 10

      if (productBreakdown.length) {
        if (y > 250) { doc.addPage(); y = 20 }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
        doc.text('Product Breakdown', 14, y); y += 4
        autoTable(doc, {
          startY: y,
          head: [['Produk', 'Klik', 'Terjual', 'Total Revenue']],
          body: productBreakdown.map(p => [p.name, String(p.klik), String(p.itemSold), fmtRp(p.total)]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: BRAND_PURPLE },
        })
      }

      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(7); doc.setTextColor(150)
        doc.text(`New Wave Live Specialist | ${platformLabel} Performance Report — ${month.label} | ${brand} | Confidential`, 14, 290)
      }

      doc.save(`${fileBase}.pdf`)
    } finally {
      setExporting(null)
    }
  }

  // ── PPT export ────────────────────────────────────────────────────────────
  async function exportPpt() {
    if (!reports.length) return
    setExporting('ppt')
    try {
      const PptxGenJS = await loadPptxGenCtor()
      const pptx = new PptxGenJS()

      let slide = pptx.addSlide()
      slide.background = { color: 'F5F3FF' }
      slide.addText('LIVE SHOPPING SPECIALIST', { x: 0.5, y: 0.4, fontSize: 10, color: '888888' })
      slide.addText(`${platformLabel.toUpperCase()} PERFORMANCE REPORT`, { x: 0.5, y: 1.0, fontSize: 26, bold: true, color: '6D28D9' })
      slide.addText(String(brand), { x: 0.5, y: 1.9, fontSize: 18, bold: true, color: '111111' })
      slide.addText(`Periode: ${month.label}`, { x: 0.5, y: 2.4, fontSize: 12, color: '555555' })
      slide.addText(`Platform: ${platformLabel} | ${sessionCount} Sesi`, { x: 0.5, y: 2.7, fontSize: 12, color: '555555' })
      slide.addText('Prepared by New Wave Live Specialist', { x: 0.5, y: 5.0, fontSize: 10, italic: true, color: '999999' })

      slide = pptx.addSlide()
      slide.addText('Executive Summary', { x: 0.5, y: 0.3, fontSize: 20, bold: true, color: '6D28D9' })
      slide.addText(execSummary, { x: 0.5, y: 1.0, w: 9, fontSize: 11, color: '333333' })
      const cardData: [string, string][] = [
        ['Total GMV', fmtRp(totalGmv)],
        ['Total Viewers', fmtNum(totalViewer)],
        ['Total Transaksi', String(totalTrans)],
        ['Total Komentar', String(totalComment)],
      ]
      cardData.forEach((c, i) => {
        const x = 0.5 + (i % 4) * 2.3
        slide.addText(c[0], { x, y: 3.2, w: 2.1, fontSize: 10, color: '888888' })
        slide.addText(c[1], { x, y: 3.5, w: 2.1, fontSize: 16, bold: true, color: '059669' })
      })

      if (dailyTrend.length) {
        slide = pptx.addSlide()
        slide.addText('Daily GMV Trend', { x: 0.5, y: 0.3, fontSize: 20, bold: true, color: '6D28D9' })
        slide.addChart(pptx.ChartType.bar, [
          { name: 'GMV', labels: dailyTrend.map(d => d.label), values: dailyTrend.map(d => d.gmv) },
        ], { x: 0.5, y: 1.0, w: 9, h: 4.2, chartColors: ['7C3AED'] })
      }

      const addTableSlides = (title: string, header: string[], rows: string[][]) => {
        if (!rows.length) return
        const chunkSize = 14
        const totalChunks = Math.ceil(rows.length / chunkSize)
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize)
          const s = pptx.addSlide()
          const part = totalChunks > 1 ? ` (${i / chunkSize + 1}/${totalChunks})` : ''
          s.addText(title + part, { x: 0.5, y: 0.3, fontSize: 20, bold: true, color: '6D28D9' })
          const tableRows = [
            header.map(h => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: '7C3AED' } } })),
            ...chunk.map(row => row.map(cell => ({ text: cell }))),
          ]
          s.addTable(tableRows as any, { x: 0.4, y: 1.0, w: 9.2, fontSize: 9, autoPage: false })
        }
      }

      addTableSlides('Session Log',
        ['Tanggal', 'Jam', 'Host', 'GMV', 'Viewer', 'Trans', 'Komentar'],
        reports.map(r => [
          fmtDateShort(r.report_date), r.start_time?.slice(0, 5) || '-', r.profiles?.full_name || '-',
          fmtRp(r.gmv), String(r.viewer || 0), String(r.trans || 0), String(r.comment_count || 0),
        ]))

      addTableSlides('Host Evaluation',
        ['Host', 'Sesi', 'Total GMV', 'Avg/Sesi', 'Viewer', 'Trans', 'CVR', 'Komentar'],
        hostEval.map(h => [h.name, String(h.sessions), fmtRp(h.totalGmv), fmtRp(h.avgGmv), String(h.totalViewer), String(h.totalTrans), `${h.cvr.toFixed(2)}%`, String(h.totalComment)]))

      addTableSlides('Product Breakdown',
        ['Produk', 'Klik', 'Terjual', 'Total Revenue'],
        productBreakdown.map(p => [p.name, String(p.klik), String(p.itemSold), fmtRp(p.total)]))

      await pptx.writeFile({ fileName: `${fileBase}.pptx` })
    } finally {
      setExporting(null)
    }
  }

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileBarChart2 size={22} className="text-brand-600" /> Client Report
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isClientRole ? 'Laporan performa live brand kamu' : 'Generate laporan performa live untuk client'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
        <div className={`grid gap-2 ${isClientRole ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <select value={monthIdx} onChange={e => setMonthIdx(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white truncate">
            {monthOptions.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
          </select>
          <select value={platform} onChange={e => setPlatform(e.target.value)}
            className="text-xs border border-gray-200 rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white truncate">
            <option value="">Semua Platform</option>
            {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {!isClientRole && (
            <select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)}
              className="text-xs border border-gray-200 rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white truncate">
              <option value="">— Pilih Client —</option>
              {clientOptions.map(c => <option key={c.id} value={c.client_brand}>{c.client_brand}</option>)}
            </select>
          )}
        </div>
      </div>

      {loadError && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5 mb-4">{loadError}</p>}

      {!brand ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          Pilih client terlebih dahulu
        </div>
      ) : loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">Memuat...</div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          Tidak ada laporan untuk filter ini
        </div>
      ) : (
        <div className="space-y-5">
          {/* Export buttons */}
          <div className="flex items-center gap-2 justify-end">
            <Filter size={13} className="text-gray-400 mr-auto" />
            <span className="text-xs text-gray-400 mr-2">{sessionCount} sesi</span>
            <button onClick={exportPdf} disabled={exporting !== null}
              className="flex items-center gap-1.5 text-sm bg-red-600 text-white px-3.5 py-2 rounded-xl font-medium hover:bg-red-700 disabled:opacity-50">
              <Download size={14} /> {exporting === 'pdf' ? 'Membuat PDF...' : 'Unduh PDF'}
            </button>
            <button onClick={exportPpt} disabled={exporting !== null}
              className="flex items-center gap-1.5 text-sm bg-orange-600 text-white px-3.5 py-2 rounded-xl font-medium hover:bg-orange-700 disabled:opacity-50">
              <Presentation size={14} /> {exporting === 'ppt' ? 'Membuat PPT...' : 'Unduh PPT'}
            </button>
          </div>

          {/* Report header */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Live Shopping Specialist</p>
            <h2 className="text-xl font-bold text-brand-700 mt-1">{platformLabel.toUpperCase()} PERFORMANCE REPORT</h2>
            <p className="text-sm font-semibold text-gray-800 mt-1">{brand}</p>
            <p className="text-xs text-gray-500 mt-2">Periode: {month.label}</p>
            <p className="text-xs text-gray-500">Platform: {platformLabel} | Periode Aktif: {periodRangeLabel} | {sessionCount} Sesi</p>
          </div>

          {/* Executive summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-2">Executive Summary</h3>
            <p className="text-xs text-gray-600 leading-relaxed">{execSummary}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <p className="text-[10px] text-emerald-600 font-medium">Total GMV</p>
                <p className="text-sm font-bold text-emerald-700 mt-0.5">{fmtRp(totalGmv)}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-[10px] text-blue-500 font-medium">Total Viewers</p>
                <p className="text-sm font-bold text-blue-700 mt-0.5">{fmtNum(totalViewer)}</p>
              </div>
              <div className="bg-brand-50 border border-brand-100 rounded-xl p-3">
                <p className="text-[10px] text-brand-500 font-medium">Transaksi</p>
                <p className="text-sm font-bold text-brand-700 mt-0.5">{totalTrans}</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-[10px] text-amber-600 font-medium">Komentar</p>
                <p className="text-sm font-bold text-amber-700 mt-0.5">{totalComment}</p>
              </div>
            </div>
            {(topHost || topProduct) && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                {topHost && (
                  <div className="border border-gray-100 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 font-medium">Top Host</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5">{topHost.name}</p>
                    <p className="text-xs text-gray-500">{fmtRp(topHost.totalGmv)} · {topHost.sessions} sesi</p>
                  </div>
                )}
                {topProduct && (
                  <div className="border border-gray-100 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 font-medium">Top Produk</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5">{topProduct.name}</p>
                    <p className="text-xs text-gray-500">{fmtRp(topProduct.total)} · {topProduct.itemSold} item</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Daily GMV trend */}
          {dailyTrend.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">Daily GMV Trend</h3>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtNum} />
                    <Tooltip formatter={(v: any) => fmtRp(Number(v))} />
                    <Bar dataKey="gmv" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Session log */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <h3 className="text-sm font-bold text-gray-800 px-5 pt-4 pb-2">Session Log</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="px-4 py-2 text-left font-semibold">Tanggal</th>
                    <th className="px-4 py-2 text-left font-semibold">Jam</th>
                    <th className="px-4 py-2 text-left font-semibold">Host</th>
                    <th className="px-4 py-2 text-right font-semibold">GMV</th>
                    <th className="px-4 py-2 text-right font-semibold">Viewer</th>
                    <th className="px-4 py-2 text-right font-semibold">Trans</th>
                    <th className="px-4 py-2 text-right font-semibold">Komentar</th>
                    <th className="px-4 py-2 text-left font-semibold">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reports.map(r => {
                    const tags = sessionTags.get(r.id)
                    return (
                      <tr key={r.id} className={`hover:bg-gray-50 ${tags ? 'bg-amber-50/50' : ''}`}>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{fmtDateShort(r.report_date)}</td>
                        <td className="px-4 py-2 text-gray-500">{r.start_time?.slice(0, 5) || '-'}</td>
                        <td className="px-4 py-2 font-medium text-brand-700">{r.profiles?.full_name || '-'}</td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">{fmtRp(r.gmv)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{fmtNum(r.viewer)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{r.trans || 0}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{r.comment_count || 0}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {tags && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                              {tags.join(', ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Session Time Evaluation */}
          {sessionTimeEval.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <h3 className="text-sm font-bold text-gray-800 px-5 pt-4 pb-2">Session Time Evaluation</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="px-4 py-2 text-left font-semibold">Start Live</th>
                      <th className="px-4 py-2 text-right font-semibold">Sesi</th>
                      <th className="px-4 py-2 text-right font-semibold">GMV</th>
                      <th className="px-4 py-2 text-right font-semibold">Viewers</th>
                      <th className="px-4 py-2 text-right font-semibold">Trans</th>
                      <th className="px-4 py-2 text-right font-semibold">Comments</th>
                      <th className="px-4 py-2 text-right font-semibold">CVR</th>
                      <th className="px-4 py-2 text-left font-semibold">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sessionTimeEval.map(s => (
                      <tr key={s.startTime} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-800">{s.startTime}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{s.sessions}</td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">{fmtRp(s.gmv)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{fmtNum(s.viewer)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{s.trans}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{s.comment}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{s.cvr.toFixed(2)}%</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {s.isMostSessions && <span className="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-semibold mr-1">★ Most Sessions</span>}
                          {s.isTopCvr && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Top CVR</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Host evaluation */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <h3 className="text-sm font-bold text-gray-800 px-5 pt-4 pb-2">Host Evaluation</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="px-4 py-2 text-left font-semibold">Host</th>
                    <th className="px-4 py-2 text-right font-semibold">Sesi</th>
                    <th className="px-4 py-2 text-right font-semibold">Total GMV</th>
                    <th className="px-4 py-2 text-right font-semibold">Avg GMV/Sesi</th>
                    <th className="px-4 py-2 text-right font-semibold">Viewer</th>
                    <th className="px-4 py-2 text-right font-semibold">Trans</th>
                    <th className="px-4 py-2 text-right font-semibold">CVR</th>
                    <th className="px-4 py-2 text-right font-semibold">Komentar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {hostEval.map(h => (
                    <tr key={h.name} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-800">
                        {h.name}
                        <span className="ml-1.5 text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-semibold align-middle">{h.rank}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">{h.sessions}</td>
                      <td className="px-4 py-2 text-right font-semibold text-emerald-700">{fmtRp(h.totalGmv)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{fmtRp(h.avgGmv)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{fmtNum(h.totalViewer)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{h.totalTrans}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{h.cvr.toFixed(2)}%</td>
                      <td className="px-4 py-2 text-right text-gray-600">{h.totalComment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Product breakdown */}
          {productBreakdown.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <h3 className="text-sm font-bold text-gray-800 px-5 pt-4 pb-2">Product Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="px-4 py-2 text-left font-semibold">Produk</th>
                      <th className="px-4 py-2 text-right font-semibold">Klik</th>
                      <th className="px-4 py-2 text-right font-semibold">Terjual</th>
                      <th className="px-4 py-2 text-right font-semibold">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {productBreakdown.map(p => (
                      <tr key={p.name} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-800">{p.name}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{p.klik}</td>
                        <td className="px-4 py-2 text-right font-semibold">{p.itemSold}</td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">{fmtRp(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Month-on-Month Evaluation */}
          {prevReports.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Month-on-Month Evaluation</h3>
              <p className="text-xs text-gray-400 mb-4">{month.label} vs {prevMonthLabel}</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {momMetrics.map(m => (
                  <div key={m.label} className="border border-gray-100 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 font-medium">{m.label}</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5">
                      {m.label === 'GMV' ? fmtRp(m.current) : fmtNum(m.current)}
                    </p>
                    <p className={`text-[11px] font-semibold mt-0.5 ${
                      m.pctChange === null ? 'text-gray-400' : m.pctChange >= 0 ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {m.pctChange === null ? '—' : `${m.pctChange >= 0 ? '▲' : '▼'} ${Math.abs(m.pctChange).toFixed(1)}%`}
                    </p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="px-3 py-2 text-left font-semibold">Metric</th>
                      <th className="px-3 py-2 text-right font-semibold">{prevMonthLabel}</th>
                      <th className="px-3 py-2 text-right font-semibold">{month.label}</th>
                      <th className="px-3 py-2 text-right font-semibold">MoM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {momMetrics.map(m => (
                      <tr key={m.label}>
                        <td className="px-3 py-2 font-medium text-gray-800">{m.label}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{m.label === 'GMV' ? fmtRp(m.previous) : fmtNum(m.previous)}</td>
                        <td className="px-3 py-2 text-right text-gray-800 font-semibold">{m.label === 'GMV' ? fmtRp(m.current) : fmtNum(m.current)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${
                          m.pctChange === null ? 'text-gray-400' : m.pctChange >= 0 ? 'text-emerald-600' : 'text-red-500'
                        }`}>
                          {m.pctChange === null ? '—' : `${m.pctChange >= 0 ? '+' : ''}${m.pctChange.toFixed(1)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </AppShell>
  )
}
