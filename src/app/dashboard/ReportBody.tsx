'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import AppShell from '@/components/AppShell'
import { FileBarChart2, Presentation, FileSpreadsheet, X } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  tagSessions, computeSessionTimeEval, computeMoM, totalsOf, rankLabel, splitByPlatform,
  generateDailyHighlights, generateKeyFindings, generateSessionTimeInsight,
  generateHostInsight, generateProductInsight, generateMoMInsight,
  computeSessionTimeEval2Month, computeHostEval2Month,
  generateSessionTime2MonthInsight, generateHostEval2MonthInsight,
} from './reportUtils'

type ReportMode = 'Shopee' | 'TikTok' | 'Both' | null

const ALL_BRANDS = '__ALL__'
const ALL_BRANDS_LABEL = 'Semua Client (Gabungan)'
const PLATFORMS = ['TikTok', 'Shopee', 'Instagram', 'YouTube', 'Other']
const PPTXGENJS_CDN_URL = 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js'

// Template palette extracted from the client-supplied .pptx (16:9, 10 x 5.625in).
const T = {
  purple: '7B6BA4', purpleLight: '9B8EC4', purpleBg: 'E8E4F0', purpleBgAlt: 'F0EDF8',
  blueBg: 'E8F4F8', redBg: 'FFE8E0', dark: '2D2D2D', gray: '64748B', green: '15803D',
  red: 'C0392B', border: 'DDDDDD', navy: '1A1A2E', white: 'FFFFFF',
  lavender: 'D4CCE8', mutedLavender: '9B9BAA',
}
const FONT = 'Calibri'

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

// pptxgenjs embeds images as base64, so same-origin assets are read into a
// data URL first. Returns null on failure so a missing logo never blocks the
// whole export.
async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
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
function csvEscape(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

// The former /client-report page's content, now living directly on the
// Dashboard. Client role is scoped to their own brand automatically;
// superadmin/operator/host_manager get a brand picker to drill into any client.
export default function ReportBody({ profile }: { profile: any }) {
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
  const [exporting, setExporting] = useState<'report' | null>(null)
  // Download Report flow: overrides the plain `platform` browsing filter
  // while active, then triggers the pptx build once data has loaded.
  // null = normal on-screen browsing using the filter dropdown.
  const [reportMode, setReportMode] = useState<ReportMode>(null)
  const [showReportModal, setShowReportModal] = useState(false)

  const month = monthOptions[monthIdx]
  const brand = isClientRole ? profile.client_brand : selectedBrand
  const isAllBrands = !isClientRole && brand === ALL_BRANDS
  const brandLabel = isAllBrands ? ALL_BRANDS_LABEL : brand

  // Admin-like roles: fetch the client brand picker options
  useEffect(() => {
    if (isClientRole) return
    fetch('/api/client-report/clients').then(r => r.json()).then(json => {
      setClientOptions(json.clients || [])
    })
  }, [isClientRole])

  // reportMode (set via the Download Report modal) overrides the plain
  // platform dropdown filter for what gets fetched: 'Both' fetches Shopee +
  // TikTok together (not all 5 platforms), single mode fetches just that one.
  const fetchScope: { platform?: string; platforms?: string[] } = reportMode === 'Both'
    ? { platforms: ['Shopee', 'TikTok'] }
    : reportMode ? { platform: reportMode } : { platform: platform || undefined }

  const fetchReport = useCallback(async () => {
    if (!brand) { setReports([]); setProducts([]); setPrevReports([]); return }
    setLoading(true); setLoadError('')
    try {
      const prevMonth = prevMonthRange(month.start)
      const [res, prevRes] = await Promise.all([
        fetch('/api/client-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand: isAllBrands ? undefined : brand, allBrands: isAllBrands, ...fetchScope, month_start: month.start, month_end: month.end }),
        }),
        fetch('/api/client-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand: isAllBrands ? undefined : brand, allBrands: isAllBrands, ...fetchScope, month_start: prevMonth.start, month_end: prevMonth.end }),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, isAllBrands, platform, reportMode, month.start, month.end])

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

  // One row per live DATE (not per session) for the deck's "Daily Evaluation
  // — Detail" page. The template brand ran ~1 session/day so its table was 1
  // row per session; brands with several sessions a day would otherwise spill
  // over many slides. The raw per-session rows stay available via the
  // "Download Details Live" CSV.
  const dailyDetail = useMemo(() => {
    const map: Record<string, ReportRow[]> = {}
    reports.forEach(r => { (map[r.report_date] ||= []).push(r) })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => {
      const times = (rows.map(r => r.start_time?.slice(0, 5)).filter(Boolean) as string[]).sort()
      const byHost: Record<string, number> = {}
      rows.forEach(r => {
        const n = r.profiles?.full_name || 'Tanpa Host'
        byHost[n] = (byHost[n] || 0) + (r.gmv || 0)
      })
      const hostNames = Object.entries(byHost).sort((a, b) => b[1] - a[1]).map(([n]) => n)
      const tags = new Set<string>()
      rows.forEach(r => (sessionTags.get(r.id) || []).forEach(t => { if (t) tags.add(t) }))
      return {
        date,
        sessions: rows.length,
        startLive: times.length === 0 ? '-' : times.length === 1 ? times[0] : `${times[0]}–${times[times.length - 1]}`,
        host: hostNames.length === 0 ? '-' : hostNames.length === 1 ? hostNames[0] : `${hostNames[0]} +${hostNames.length - 1}`,
        gmv: rows.reduce((s, r) => s + (r.gmv || 0), 0),
        viewer: rows.reduce((s, r) => s + (r.viewer || 0), 0),
        trans: rows.reduce((s, r) => s + (r.trans || 0), 0),
        comment: rows.reduce((s, r) => s + (r.comment_count || 0), 0),
        keterangan: tags.size ? Array.from(tags).join(', ') : '-',
      }
    })
  }, [reports, sessionTags])

  // Performance grouped by Start Live hour.
  const sessionTimeEval = useMemo(() => computeSessionTimeEval(reports), [reports])

  // This month vs last calendar month, same brand/platform.
  const momMetrics = useMemo(() => computeMoM(totalsOf(reports), totalsOf(prevReports)), [reports, prevReports])
  const prevMonthLabel = useMemo(() => {
    const [y, m] = month.start.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  }, [month.start])

  // 2-month cumulative Session Time / Host evaluation (current + previous month combined).
  const session2MonthEval = useMemo(() => computeSessionTimeEval2Month(reports, prevReports), [reports, prevReports])
  const host2MonthEval = useMemo(() => computeHostEval2Month(reports, prevReports), [reports, prevReports])
  const session2MonthInsight = useMemo(
    () => generateSessionTime2MonthInsight(session2MonthEval, month.label, prevMonthLabel),
    [session2MonthEval, month.label, prevMonthLabel])
  const host2MonthInsight = useMemo(
    () => generateHostEval2MonthInsight(host2MonthEval, month.label, prevMonthLabel),
    [host2MonthEval, month.label, prevMonthLabel])

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
  const platformLabel = reportMode === 'Both' ? 'Shopee + TikTok' : reportMode || platform || 'Semua Platform'
  const shopeeTiktokSplit = useMemo(
    () => reportMode === 'Both' ? splitByPlatform(reports, ['Shopee', 'TikTok']) : null,
    [reportMode, reports])

  // Auto-generated narrative text — all derived purely from our own data.
  const dailyHighlights = useMemo(() => generateDailyHighlights(reports, sessionTags), [reports, sessionTags])
  const keyFindings = useMemo(() => generateKeyFindings(reports, sessionTags, hostEval, totalGmv, month.label), [reports, sessionTags, hostEval, totalGmv, month.label])
  const sessionTimeInsight = useMemo(() => generateSessionTimeInsight(sessionTimeEval), [sessionTimeEval])
  const hostInsight = useMemo(() => generateHostInsight(hostEval), [hostEval])
  const productInsight = useMemo(() => generateProductInsight(productBreakdown, totalGmv), [productBreakdown, totalGmv])
  const momInsight = useMemo(() => generateMoMInsight(momMetrics), [momMetrics])

  const periodRangeLabel = reports.length
    ? `${fmtDateShort(reports[0].report_date)} – ${fmtDateFull(reports[reports.length - 1].report_date)}`
    : month.label

  const execSummary = reports.length
    ? `Selama periode ${periodRangeLabel}, New Wave Live Specialist melaksanakan ${sessionCount} sesi live ${platform || ''} untuk ${brandLabel}. ` +
      `Total GMV yang dibukukan sebesar ${fmtRp(totalGmv)} dengan ${totalTrans} transaksi, ${fmtNum(totalViewer)} viewers, dan ${totalComment} komentar.`
    : ''

  const fileBase = `${platform || 'Report'}_${brandLabel || ''}_${month.label}`.replace(/\s+/g, '_')
  const footerLine = `New Wave Live Specialist  |  ${platformLabel} Performance Report — ${month.label}  |  ${brandLabel}  |  Confidential`

  // ── Download Details Live: raw session rows as CSV, uses whatever is on screen ──
  function exportDetailsCsv() {
    if (!reports.length) return
    const header = ['Tanggal', 'Start Live', 'Host', 'Platform', 'GMV', 'Impression', 'Viewer', 'Trans', 'Comment', 'Keterangan']
    const rows = reports.map(r => {
      const tags = sessionTags.get(r.id)
      return [
        r.report_date, r.start_time?.slice(0, 5) || '', r.profiles?.full_name || '', r.platform || '',
        String(r.gmv || 0), String(r.impression || 0), String(r.viewer || 0), String(r.trans || 0), String(r.comment_count || 0),
        tags ? tags.join('/') : '',
      ]
    })
    const csv = [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Details_Live_${fileBase}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Download Report: PPTX built page-per-page from the client template ────
  // Slide order mirrors the supplied template exactly:
  //   1 Title · 2 Executive Summary · 3 Daily Evaluation · 4 Daily Evaluation
  //   — Detail · 5 Session Time · 6 Host Evaluation · 7 Product Breakdown ·
  //   8 Month-on-Month · 9 Terima Kasih · 10 Session Time 2 Bulan ·
  //   11 Host Evaluation 2 Bulan
  // (the template's own "Account Overview" page is intentionally omitted — it
  // compared against platform account-wide numbers we don't track per client).
  // Every section is capped to a single slide so the deck stays a summary.
  async function exportReportPptx() {
    if (!reports.length) { setReportMode(null); return }
    setExporting('report')
    try {
      const [PptxGenJS, logo] = await Promise.all([loadPptxGenCtor(), loadImageDataUrl('/logo.png')])
      const pptx = new PptxGenJS()
      pptx.layout = 'LAYOUT_16x9'
      const RECT = pptx.ShapeType.rect

      const addChrome = (slide: any, title: string, subtitle: string) => {
        slide.background = { color: T.white }
        slide.addShape(RECT, { x: 0, y: 0, w: 10, h: 0.09, fill: { color: T.purple }, line: { type: 'none' } })
        slide.addShape(RECT, { x: 0, y: 0.09, w: 0.07, h: 5.36, fill: { color: T.purpleLight }, line: { type: 'none' } })
        slide.addText(title, { x: 0.27, y: 0.12, w: 8.6, h: 0.42, fontFace: FONT, fontSize: 20, bold: true, color: T.dark })
        slide.addText(subtitle, { x: 0.27, y: 0.58, w: 9.3, h: 0.26, fontFace: FONT, fontSize: 10.5, color: T.gray })
        slide.addShape(RECT, { x: 0.27, y: 0.88, w: 8.65, h: 0.018, fill: { color: T.purpleBg }, line: { type: 'none' } })
        slide.addShape(RECT, { x: 0, y: 5.45, w: 10, h: 0.175, fill: { color: T.purple }, line: { type: 'none' } })
        slide.addText(footerLine, { x: 0.27, y: 5.45, w: 9.46, h: 0.175, fontFace: FONT, fontSize: 7.5, color: T.white, valign: 'middle' })
      }

      const addStatCard = (slide: any, x: number, y: number, w: number, h: number, stripe: string, label: string, value: string, sub?: string) => {
        slide.addShape(RECT, { x, y, w, h, fill: { color: T.white }, line: { color: T.border, width: 0.5 } })
        slide.addShape(RECT, { x, y, w: 0.07, h, fill: { color: stripe }, line: { type: 'none' } })
        slide.addText(label.toUpperCase(), { x: x + 0.14, y: y + 0.08, w: w - 0.24, h: 0.22, fontFace: FONT, fontSize: 8, bold: true, color: T.gray })
        slide.addText(value, { x: x + 0.14, y: y + 0.30, w: w - 0.24, h: 0.4, fontFace: FONT, fontSize: 17, bold: true, color: T.dark })
        if (sub) slide.addText(sub, { x: x + 0.14, y: y + 0.72, w: w - 0.24, h: 0.2, fontFace: FONT, fontSize: 7.5, color: T.gray })
      }

      // Insight strip sits above the footer bar (which starts at y=5.45).
      const addInsight = (slide: any, text: string) => {
        if (!text) return
        slide.addShape(RECT, { x: 0.27, y: 4.75, w: 8.65, h: 0.6, fill: { color: T.purpleBgAlt }, line: { type: 'none' } })
        slide.addText([
          { text: 'INSIGHT   ', options: { bold: true, color: T.purple, fontSize: 8 } },
          { text, options: { color: T.dark, fontSize: 8 } },
        ], { x: 0.4, y: 4.8, w: 8.4, h: 0.5, fontFace: FONT, valign: 'top' })
      }

      // One section = exactly one slide. Rows beyond `maxRows` collapse into a
      // final "... N lainnya" line, and row height/font shrink to fit whatever
      // vertical space is left once the insight strip is accounted for.
      const addSection = (
        title: string, subtitle: string, header: string[], rows: (string | number)[][],
        colW: number[], rightAlign: boolean[], insight: string, maxRows: number, moreLabel: string,
      ) => {
        if (!rows.length) return
        const slide = pptx.addSlide()
        addChrome(slide, title, subtitle)

        let shown = rows
        if (rows.length > maxRows) {
          shown = rows.slice(0, maxRows)
          const extra: (string | number)[] = new Array(header.length).fill('')
          extra[0] = `… dan ${rows.length - maxRows} ${moreLabel} lainnya`
          shown = [...shown, extra]
        }

        const yTop = 1.0
        const yBottom = insight ? 4.68 : 5.35
        const rowH = Math.min(0.26, (yBottom - yTop) / (shown.length + 1))
        const fontSize = rowH >= 0.22 ? 8.5 : rowH >= 0.17 ? 7.5 : rowH >= 0.14 ? 6.5 : 6
        // PowerPoint grows a row when its content + cell padding exceeds rowH,
        // which would push a dense table off the slide. Shrink the padding to
        // whatever room is left after the text's own line height.
        const margin = Math.max(0, Math.min(2, (rowH * 72 - fontSize * 1.2) / 2))

        const tableRows = [
          header.map(h => ({ text: h, options: { bold: true, color: T.white, fill: { color: T.purple }, fontSize, align: 'left' as const } })),
          ...shown.map(row => row.map((cell, ci) => ({
            text: String(cell),
            options: { color: T.dark, fill: { color: T.white }, fontSize, align: rightAlign[ci] ? 'right' as const : 'left' as const },
          }))),
        ]
        slide.addTable(tableRows, {
          x: 0.27, y: yTop, w: 8.65, colW, rowH, margin,
          border: { type: 'solid', color: T.border, pts: 0.5 },
          fontFace: FONT, valign: 'middle', autoPage: false,
        })
        addInsight(slide, insight)
      }

      // ── 1. Title ──
      {
        const slide = pptx.addSlide()
        slide.background = { color: T.dark }
        slide.addShape(RECT, { x: 0, y: 0, w: 3.5, h: 5.625, fill: { color: T.purple }, line: { type: 'none' } })
        slide.addShape(RECT, { x: 3.5, y: 0, w: 0.55, h: 5.625, fill: { color: T.purpleLight }, line: { type: 'none' } })
        if (logo) slide.addImage({ data: logo, x: 0.35, y: 0.65, w: 2.8, h: 2.8 })
        slide.addText('LIVE SHOPPING SPECIALIST', { x: 0.2, y: 3.57, w: 3.1, h: 0.28, fontFace: FONT, fontSize: 7.5, color: T.lavender, charSpacing: 2 })
        slide.addShape(RECT, { x: 0.3, y: 3.92, w: 2.9, h: 0.03, fill: { color: T.purpleLight }, line: { type: 'none' } })
        slide.addText('Prepared by New Wave Live Specialist', { x: 0.2, y: 4.02, w: 3.1, h: 0.25, fontFace: FONT, fontSize: 8, italic: true, color: T.mutedLavender })

        slide.addText(`${platformLabel.toUpperCase()} PERFORMANCE REPORT`, { x: 4.3, y: 2.72, w: 5.5, h: 0.3, fontFace: FONT, fontSize: 10, color: T.purpleBg, charSpacing: 2 })
        slide.addText(brandLabel, { x: 4.3, y: 3.05, w: 5.5, h: 0.7, fontFace: FONT, fontSize: 34, bold: true, color: T.white })
        slide.addText(`Periode: ${month.label}`, { x: 4.3, y: 3.75, w: 5.5, h: 0.45, fontFace: FONT, fontSize: 20, color: T.purpleBg })
        slide.addShape(RECT, { x: 4.3, y: 4.27, w: 5.4, h: 0.03, fill: { color: T.purpleLight }, line: { type: 'none' } })
        slide.addText(`Platform: ${platformLabel}`, { x: 4.3, y: 4.37, w: 5.4, h: 0.27, fontFace: FONT, fontSize: 10, color: T.mutedLavender })
        slide.addText(`Periode Aktif: ${periodRangeLabel}  |  ${sessionCount} Sesi`, { x: 4.3, y: 4.65, w: 5.4, h: 0.27, fontFace: FONT, fontSize: 9.5, color: T.mutedLavender })
        slide.addShape(RECT, { x: 4.3, y: 5.0, w: 5.4, h: 0.55, fill: { color: T.navy }, line: { type: 'none' } })
        slide.addText(
          'Laporan mencakup: Executive Summary • Daily Evaluation • Session Time • Host Evaluation\nProduct Breakdown • MoM Comparison' +
          (shopeeTiktokSplit ? ' • Shopee vs TikTok' : ''),
          { x: 4.4, y: 5.02, w: 5.2, h: 0.5, fontFace: FONT, fontSize: 8, color: T.purpleBg, valign: 'middle' })
      }

      // ── 2. Executive Summary ──
      {
        const slide = pptx.addSlide()
        addChrome(slide, 'Executive Summary', `${brandLabel} — ${platformLabel} | ${month.label} | New Wave Live Specialist`)
        slide.addText(execSummary, { x: 0.27, y: 1.03, w: 8.65, h: 0.78, fontFace: FONT, fontSize: 9.5, color: T.dark, valign: 'top' })

        const cardW = 1.98, gap = 0.13, x0 = 0.27, y1 = 1.97, y2 = 3.07, cardH = 0.98
        const xs = [x0, x0 + cardW + gap, x0 + 2 * (cardW + gap), x0 + 3 * (cardW + gap)]
        addStatCard(slide, xs[0], y1, cardW, cardH, T.purple, 'Total GMV', fmtRp(totalGmv), `${sessionCount} Sesi Live`)
        addStatCard(slide, xs[1], y1, cardW, cardH, T.green, 'Total Viewers', fmtNum(totalViewer), 'Session Viewers')
        addStatCard(slide, xs[2], y1, cardW, cardH, T.red, 'Total Transaksi', fmtNum(totalTrans), 'Confirmed Orders')
        addStatCard(slide, xs[3], y1, cardW, cardH, T.purpleLight, 'Total Komentar', fmtNum(totalComment), 'Audience Engagement')
        if (topHost) addStatCard(slide, xs[0], y2, cardW, cardH, T.red, 'Top Host', topHost.name, `${fmtRp(topHost.totalGmv)} · ${topHost.sessions} sesi`)
        if (topProduct) addStatCard(slide, xs[1], y2, cardW, cardH, T.purpleLight, 'Top Produk', topProduct.name.slice(0, 26), `${fmtRp(topProduct.total)} · ${topProduct.itemSold} item`)
        if (keyFindings.length) {
          slide.addShape(RECT, { x: xs[2], y: y2, w: cardW * 2 + gap, h: cardH, fill: { color: T.purpleBgAlt }, line: { type: 'none' } })
          slide.addText([
            { text: 'KEY FINDINGS\n', options: { bold: true, color: T.purple, fontSize: 8 } },
            ...keyFindings.slice(0, 2).map(f => ({ text: `• ${f}\n`, options: { color: T.dark, fontSize: 7 } })),
          ], { x: xs[2] + 0.12, y: y2 + 0.06, w: cardW * 2 + gap - 0.24, h: cardH - 0.12, fontFace: FONT, valign: 'top' })
        }
        if (keyFindings.length > 2) {
          slide.addShape(RECT, { x: 0.27, y: 4.2, w: 8.65, h: 1.1, fill: { color: T.purpleBgAlt }, line: { type: 'none' } })
          slide.addText([
            { text: 'KEY FINDINGS (lanjutan)\n', options: { bold: true, color: T.purple, fontSize: 8 } },
            ...keyFindings.slice(2).map(f => ({ text: `• ${f}\n`, options: { color: T.dark, fontSize: 7.5 } })),
          ], { x: 0.4, y: 4.26, w: 8.4, h: 1.0, fontFace: FONT, valign: 'top' })
        }
      }

      // ── 3. Daily Evaluation (chart + highlight cards) ──
      if (dailyTrend.length) {
        const slide = pptx.addSlide()
        addChrome(slide, 'Daily Evaluation', `GMV Trend Harian (${platformLabel}) — ${month.label}`)
        slide.addChart(pptx.ChartType.bar, [
          { name: 'GMV', labels: dailyTrend.map(d => d.label), values: dailyTrend.map(d => d.gmv) },
        ], { x: 0.27, y: 1.0, w: 8.65, h: 2.65, chartColors: [T.purple], showLegend: false, catAxisLabelFontSize: 6, valAxisLabelFontSize: 6 })
        const tagStyle: Record<string, { bg: string; icon: string }> = {
          'Best Session': { bg: T.redBg, icon: '🏆' },
          'Twindate': { bg: T.blueBg, icon: '📅' },
          'Payday': { bg: T.purpleBgAlt, icon: '💰' },
        }
        const hw = (8.65 - 2 * 0.15) / 3
        dailyHighlights.slice(0, 3).forEach((h, i) => {
          const x = 0.27 + i * (hw + 0.15)
          const c = tagStyle[h.tag] || { bg: T.purpleBg, icon: '⭐' }
          slide.addShape(RECT, { x, y: 3.8, w: hw, h: 1.5, fill: { color: c.bg }, line: { type: 'none' } })
          slide.addText(`${c.icon}  ${h.tag} — ${h.dateLabel}`, { x: x + 0.1, y: 3.86, w: hw - 0.2, h: 0.3, fontFace: FONT, fontSize: 8.5, bold: true, color: T.dark })
          slide.addText(`GMV: ${fmtRp(h.gmv)}  |  Trans: ${fmtNum(h.trans)}`, { x: x + 0.1, y: 4.18, w: hw - 0.2, h: 0.25, fontFace: FONT, fontSize: 7.5, color: T.dark })
          slide.addText(`Viewer: ${fmtNum(h.viewer)}  |  Host: ${h.host}  |  ${h.startTime}`, { x: x + 0.1, y: 4.45, w: hw - 0.2, h: 0.25, fontFace: FONT, fontSize: 7.5, color: T.dark })
        })
      }

      // ── 4. Daily Evaluation — Detail (one row per live date) ──
      addSection(
        'Daily Evaluation — Detail',
        `${platformLabel} Daily Log, diurutkan berdasarkan tanggal — ${dailyDetail.length} Hari Live / ${sessionCount} Sesi (${month.label})`,
        ['Tanggal', 'Sesi', 'Start Live', 'Host', 'GMV', 'Viewer', 'Trans', 'Comment', 'Keterangan'],
        dailyDetail.map(d => [
          fmtDateShort(d.date), d.sessions, d.startLive, d.host,
          fmtRp(d.gmv), fmtNum(d.viewer), fmtNum(d.trans), fmtNum(d.comment), d.keterangan,
        ]),
        [0.85, 0.5, 0.95, 1.5, 1.35, 0.8, 0.7, 0.8, 1.2],
        [false, true, false, false, true, true, true, true, false],
        '', 32, 'hari')

      // ── 5. Session Time Evaluation ──
      addSection(
        'Session Time Evaluation', `Performance Analysis by Start Live Time (${platformLabel}) — ${month.label}`,
        ['Start Live', 'Sesi', 'GMV', 'Viewers', 'Trans', 'Comments', 'CVR', 'Keterangan'],
        sessionTimeEval.map(s => [
          s.startTime, s.sessions, fmtRp(s.gmv), fmtNum(s.viewer), fmtNum(s.trans), fmtNum(s.comment), `${s.cvr.toFixed(2)}%`,
          [s.isMostSessions && '★ Most Sessions', s.isTopCvr && 'Top CVR'].filter(Boolean).join(' / ') || '-',
        ]),
        [1.0, 0.7, 1.2, 0.95, 0.75, 0.95, 0.8, 2.3],
        [false, true, true, true, true, true, true, false],
        sessionTimeInsight, 24, 'slot')

      // ── 6. Host Evaluation ──
      addSection(
        'Host Evaluation', `GMV Performance & Conversion Rate per Host (${platformLabel}) — ${month.label}`,
        ['Host', 'Sesi', 'Total GMV', 'Avg GMV/Sesi', 'Viewer', 'Trans', 'CVR', 'Comment', 'Ranking'],
        hostEval.map(h => [h.name, h.sessions, fmtRp(h.totalGmv), fmtRp(h.avgGmv), fmtNum(h.totalViewer), fmtNum(h.totalTrans), `${h.cvr.toFixed(2)}%`, fmtNum(h.totalComment), h.rank]),
        [1.4, 0.55, 1.25, 1.25, 0.8, 0.65, 0.7, 0.8, 1.25],
        [false, true, true, true, true, true, true, true, false],
        hostInsight, 20, 'host')

      // ── 7. Product Breakdown ──
      addSection(
        'Product Breakdown', `${platformLabel} Product Mix (Sesi New Wave) — ${month.label}`,
        ['Produk', 'GMV', 'Item', 'Klik'],
        productBreakdown.map(p => [p.name, fmtRp(p.total), fmtNum(p.itemSold), fmtNum(p.klik)]),
        [4.85, 1.6, 1.1, 1.1],
        [false, true, true, true],
        productInsight, 14, 'produk')

      // ── 8. Month-on-Month Evaluation ──
      if (prevReports.length) {
        const slide = pptx.addSlide()
        addChrome(slide, 'Month-on-Month Evaluation', `${month.label} vs ${prevMonthLabel} — New Wave ${platformLabel} Performance`)
        const cardW = 1.66, gap = 0.09, y = 1.05, h = 1.15
        momMetrics.forEach((m, i) => {
          const x = 0.27 + i * (cardW + gap)
          const up = m.pctChange !== null && m.pctChange >= 0
          slide.addShape(RECT, { x, y, w: cardW, h, fill: { color: T.white }, line: { color: T.border, width: 0.5 } })
          slide.addText(m.label, { x: x + 0.08, y: y + 0.06, w: cardW - 0.16, h: 0.2, fontFace: FONT, fontSize: 8, bold: true, color: T.gray })
          slide.addText(m.label === 'GMV' ? fmtRp(m.current) : fmtNum(m.current), { x: x + 0.08, y: y + 0.28, w: cardW - 0.16, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color: T.dark })
          slide.addText(m.pctChange === null ? '—' : `${up ? '▲' : '▼'} ${Math.abs(m.pctChange).toFixed(1)}% MoM`,
            { x: x + 0.08, y: y + 0.68, w: cardW - 0.16, h: 0.3, fontFace: FONT, fontSize: 9, bold: true, color: m.pctChange === null ? T.gray : up ? T.green : T.red })
        })
        const header = ['Metric', prevMonthLabel, month.label, 'MoM'].map(t => ({ text: t, options: { bold: true, color: T.white, fill: { color: T.purple }, fontSize: 8.5 } }))
        const rows = momMetrics.map(m => [
          { text: m.label, options: { color: T.dark, fontSize: 8 } },
          { text: m.label === 'GMV' ? fmtRp(m.previous) : fmtNum(m.previous), options: { color: T.dark, fontSize: 8, align: 'right' as const } },
          { text: m.label === 'GMV' ? fmtRp(m.current) : fmtNum(m.current), options: { color: T.dark, fontSize: 8, align: 'right' as const, bold: true } },
          { text: m.pctChange === null ? '—' : `${m.pctChange >= 0 ? '+' : ''}${m.pctChange.toFixed(1)}%`, options: { color: m.pctChange === null ? T.gray : m.pctChange >= 0 ? T.green : T.red, fontSize: 8, align: 'right' as const, bold: true } },
        ])
        slide.addTable([header, ...rows], { x: 0.27, y: 2.4, w: 8.65, colW: [2.9, 1.95, 1.95, 1.85], rowH: 0.28, border: { type: 'solid', color: T.border, pts: 0.5 }, fontFace: FONT, valign: 'middle', autoPage: false })
        addInsight(slide, momInsight)
      }

      // ── Shopee vs TikTok Comparison (only in "Both" mode) ──
      if (shopeeTiktokSplit) {
        const s = shopeeTiktokSplit['Shopee'] || totalsOf([])
        const t = shopeeTiktokSplit['TikTok'] || totalsOf([])
        const totalGmvBoth = s.gmv + t.gmv
        addSection(
          'Shopee vs TikTok Comparison', `${brandLabel} — ${month.label}`,
          ['Metric', 'Shopee', 'TikTok', 'Total'],
          [
            ['Sesi', fmtNum(s.sessions), fmtNum(t.sessions), fmtNum(s.sessions + t.sessions)],
            ['GMV', fmtRp(s.gmv), fmtRp(t.gmv), fmtRp(totalGmvBoth)],
            ['Transaksi', fmtNum(s.trans), fmtNum(t.trans), fmtNum(s.trans + t.trans)],
            ['Viewers', fmtNum(s.viewer), fmtNum(t.viewer), fmtNum(s.viewer + t.viewer)],
            ['Comments', fmtNum(s.comment), fmtNum(t.comment), fmtNum(s.comment + t.comment)],
            ['GMV Share', totalGmvBoth ? `${((s.gmv / totalGmvBoth) * 100).toFixed(1)}%` : '—', totalGmvBoth ? `${((t.gmv / totalGmvBoth) * 100).toFixed(1)}%` : '—', '100%'],
          ],
          [2.65, 2.0, 2.0, 2.0],
          [false, true, true, true],
          '', 10, 'metrik')
      }

      // ── 9. Terima Kasih (closing) ──
      {
        const slide = pptx.addSlide()
        slide.background = { color: T.dark }
        slide.addShape(RECT, { x: 0, y: 0, w: 10, h: 0.09, fill: { color: T.purple }, line: { type: 'none' } })
        slide.addShape(RECT, { x: 0, y: 5.535, w: 10, h: 0.09, fill: { color: T.purple }, line: { type: 'none' } })
        if (logo) slide.addImage({ data: logo, x: 4.05, y: 0.85, w: 1.9, h: 1.9 })
        slide.addText('TERIMA KASIH', { x: 0, y: 2.95, w: 10, h: 0.65, fontFace: FONT, fontSize: 32, bold: true, color: T.white, align: 'center' })
        slide.addShape(RECT, { x: 4, y: 3.68, w: 2, h: 0.03, fill: { color: T.purpleLight }, line: { type: 'none' } })
        slide.addText(`${platformLabel} Performance Report — ${brandLabel} — ${month.label}`, { x: 0, y: 3.8, w: 10, h: 0.3, fontFace: FONT, fontSize: 12, color: T.purpleBg, align: 'center' })
        slide.addText('New Wave Live Specialist  |  Live Shopping Specialist', { x: 0, y: 4.15, w: 10, h: 0.28, fontFace: FONT, fontSize: 9.5, color: T.mutedLavender, align: 'center' })
        slide.addText('Pertanyaan & diskusi lebih lanjut dapat disampaikan kepada tim New Wave Live Specialist.', { x: 0, y: 4.95, w: 10, h: 0.25, fontFace: FONT, fontSize: 9, color: T.mutedLavender, align: 'center' })
      }

      // ── 10-11. Two-month cumulative appendix (template keeps these after the
      // closing slide, so the order below matches it deliberately) ──
      if (prevReports.length && session2MonthEval.length) {
        addSection(
          'Session Time Evaluation — 2 Bulan',
          `${prevMonthLabel} vs ${month.label} — New Wave ${platformLabel} (${sessionCount + prevReports.length} Sesi Gabungan)`,
          ['Slot', `Sesi ${prevMonthLabel}`, `GMV ${prevMonthLabel}`, `Sesi ${month.label}`, `GMV ${month.label}`, 'Total Sesi', 'Total GMV', 'Avg/Sesi', 'CVR', 'Keterangan'],
          session2MonthEval.map(s => [
            s.startTime, s.prevSessions, fmtRp(s.prevGmv), s.curSessions, fmtRp(s.curGmv),
            s.totalSessions, fmtRp(s.totalGmv), fmtRp(s.avgGmv), `${s.cvr.toFixed(2)}%`,
            [s.isMostSessions && '★ Most Sessions', s.isTopCvr && 'Top CVR', s.isCurOnly && `${month.label} Only`, s.isPrevOnly && `${prevMonthLabel} Only`].filter(Boolean).join(' / ') || '-',
          ]),
          [0.55, 0.6, 0.95, 0.6, 0.95, 0.6, 0.95, 0.95, 0.55, 1.95],
          [false, true, true, true, true, true, true, true, true, false],
          session2MonthInsight, 22, 'slot')
      }

      if (prevReports.length && host2MonthEval.length) {
        addSection(
          'Host Evaluation — 2 Bulan', `${prevMonthLabel} vs ${month.label} — New Wave ${platformLabel} (Kumulatif)`,
          ['Host', `Sesi ${prevMonthLabel}`, `GMV ${prevMonthLabel}`, `Sesi ${month.label}`, `GMV ${month.label}`, 'Total Sesi', 'Total GMV', 'Avg/Sesi', 'CVR', 'Keterangan'],
          host2MonthEval.map((h, i) => [
            h.name, h.prevSessions, fmtRp(h.prevGmv), h.curSessions, fmtRp(h.curGmv),
            h.totalSessions, fmtRp(h.totalGmv), fmtRp(h.avgGmv), `${h.cvr.toFixed(2)}%`,
            [i === 0 && '#1 GMV Total', i === 1 && '#2 GMV', i === 2 && '#3 GMV', h.isCurOnly && `${month.label} Only`, h.isPrevOnly && `${prevMonthLabel} Only`].filter(Boolean).join(' / ') || '-',
          ]),
          [0.85, 0.6, 0.9, 0.6, 0.9, 0.6, 0.9, 0.9, 0.5, 1.9],
          [false, true, true, true, true, true, true, true, true, false],
          host2MonthInsight, 20, 'host')
      }

      await pptx.writeFile({ fileName: `${fileBase}.pptx` })
    } finally {
      setExporting(null)
      setReportMode(null)
    }
  }
  // Kick off the pptx build once the picked platform's data has loaded.
  useEffect(() => {
    if (!reportMode || loading) return
    exportReportPptx()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportMode, loading])

  return (
    <AppShell role={profile.role as any} userName={profile.full_name}>
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileBarChart2 size={22} className="text-brand-600" /> Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isClientRole ? 'Laporan performa live brand kamu' : 'Performa live per client'}
          </p>
        </div>
        {reports.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={exportDetailsCsv}
              className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 text-gray-700 px-3.5 py-2 rounded-xl font-medium hover:bg-gray-50">
              <FileSpreadsheet size={14} /> Download Details Live
            </button>
            <button onClick={() => setShowReportModal(true)} disabled={exporting !== null}
              className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3.5 py-2 rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50">
              <Presentation size={14} /> {exporting ? 'Membuat laporan...' : 'Download Report'}
            </button>
          </div>
        )}
      </div>

      {/* Download Report modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowReportModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-gray-900 text-sm">Pilih Platform</h3>
              <button onClick={() => setShowReportModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Laporan untuk {brandLabel} — {month.label}</p>
            <div className="space-y-2">
              {(['Shopee', 'TikTok', 'Both'] as const).map(opt => (
                <button key={opt} onClick={() => { setShowReportModal(false); setReportMode(opt) }}
                  className="w-full text-left border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 hover:border-brand-400 hover:bg-brand-50 transition-colors">
                  {opt === 'Both' ? 'Shopee + TikTok (gabungan)' : opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
              <option value={ALL_BRANDS}>{ALL_BRANDS_LABEL}</option>
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
          {/* Report header */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Live Shopping Specialist</p>
            <h2 className="text-xl font-bold text-brand-700 mt-1">{platformLabel.toUpperCase()} PERFORMANCE REPORT</h2>
            <p className="text-sm font-semibold text-gray-800 mt-1">{brandLabel}</p>
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
            {keyFindings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Key Findings</p>
                <ul className="space-y-1.5">
                  {keyFindings.map((f, i) => (
                    <li key={i} className="text-xs text-gray-600 leading-relaxed flex gap-2">
                      <span className="text-brand-400">•</span><span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Daily GMV trend */}
          {dailyTrend.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">Daily Evaluation — GMV Trend</h3>
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
              {dailyHighlights.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  {dailyHighlights.map(h => (
                    <div key={h.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">{h.tag} — {h.dateLabel}</p>
                      <p className="text-sm font-bold text-gray-800 mt-1">{fmtRp(h.gmv)}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {h.trans} trans · {fmtNum(h.viewer)} viewer · Host: {h.host} · {h.startTime}
                      </p>
                    </div>
                  ))}
                </div>
              )}
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
              {sessionTimeInsight && (
                <div className="mx-5 mb-4 mt-1 bg-brand-50 border border-brand-100 rounded-xl px-3.5 py-2.5">
                  <p className="text-[9px] font-bold text-brand-500 uppercase tracking-widest mb-1">Insight</p>
                  <p className="text-xs text-brand-800 leading-relaxed">{sessionTimeInsight}</p>
                </div>
              )}
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
            {hostInsight && (
              <div className="mx-5 mb-4 mt-1 bg-brand-50 border border-brand-100 rounded-xl px-3.5 py-2.5">
                <p className="text-[9px] font-bold text-brand-500 uppercase tracking-widest mb-1">Insight</p>
                <p className="text-xs text-brand-800 leading-relaxed">{hostInsight}</p>
              </div>
            )}
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
              {productInsight && (
                <div className="mx-5 mb-4 mt-1 bg-brand-50 border border-brand-100 rounded-xl px-3.5 py-2.5">
                  <p className="text-[9px] font-bold text-brand-500 uppercase tracking-widest mb-1">Insight</p>
                  <p className="text-xs text-brand-800 leading-relaxed">{productInsight}</p>
                </div>
              )}
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
              {momInsight && (
                <div className="mt-4 bg-brand-50 border border-brand-100 rounded-xl px-3.5 py-2.5">
                  <p className="text-[9px] font-bold text-brand-500 uppercase tracking-widest mb-1">Insight</p>
                  <p className="text-xs text-brand-800 leading-relaxed">{momInsight}</p>
                </div>
              )}
            </div>
          )}

          {/* Shopee vs TikTok Comparison — only when browsing with no platform filter and both exist */}
          {reportMode === null && shopeeTiktokSplit === null && platform === '' && reports.some(r => r.platform === 'Shopee') && reports.some(r => r.platform === 'TikTok') && (
            <p className="text-xs text-gray-400 text-center">
              Pilih "Shopee + TikTok (gabungan)" di Download Report untuk melihat halaman perbandingan Shopee vs TikTok.
            </p>
          )}
        </div>
      )}
    </div>
    </AppShell>
  )
}
