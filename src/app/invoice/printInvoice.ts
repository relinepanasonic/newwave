// Generates a print-ready invoice window styled after the echo reference,
// branded with the New Wave logo. The user can Save-as-PDF from the print dialog.

interface InvoiceItem {
  name: string
  description?: string
  tipe_live?: string
  jam_per_sesi?: number
  qty: number
  price: number
  amount: number
  is_free?: boolean
}

interface Invoice {
  invoice_number: string
  invoice_date: string
  brand: string
  invoice_to: string
  sub_total: number
  discount_pct: number
  ppn_pct: number
  pph_pct?: number
  total_amount: number
  bank_name: string
  bank_account_name: string
  bank_account_number: string
  notes: string
  invoice_items?: InvoiceItem[]
}

function rp(n: number) {
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n))
}

function esc(s: string) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Description lines → bullet list (split on newline or " · " or "•")
function descToBullets(desc: string): string {
  if (!desc?.trim()) return ''
  const parts = desc.split(/\n|•|·/).map(s => s.trim()).filter(Boolean)
  if (parts.length <= 1) return `<span>${esc(desc)}</span>`
  return `<ul>${parts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`
}

export function printInvoice(inv: Invoice) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const items = inv.invoice_items || []

  const discountAmt = Math.round(inv.sub_total * (inv.discount_pct / 100))
  const afterDiscount = inv.sub_total - discountAmt
  const ppnAmt = Math.round(afterDiscount * (inv.ppn_pct / 100))
  const pphPct = inv.pph_pct ?? 0
  const pphAmt = Math.round(inv.total_amount * (pphPct / 100))
  const realTotal = inv.total_amount - pphAmt

  const dateLabel = new Date(inv.invoice_date + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const rows = items.map(it => `
    <tr>
      <td class="c-name">
        <div class="nm">${esc(it.name)}</div>
        ${it.tipe_live ? `<div class="tp">${esc(it.tipe_live)}${it.jam_per_sesi ? ` · ${it.jam_per_sesi} jam/sesi` : ''}</div>` : ''}
      </td>
      <td class="c-desc">${descToBullets(it.description || '')}</td>
      <td class="c-qty">${it.qty}</td>
      <td class="c-price">${it.is_free ? 'Free' : rp(it.price)}</td>
      <td class="c-amt">${it.is_free ? '0' : rp(it.amount)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8"/>
<title>Invoice ${esc(inv.invoice_number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #1e293b; background: #fff; padding: 48px 56px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .title { font-size: 56px; font-weight: 800; letter-spacing: -1px; color: #1e2a4a; }
  .logo-box { text-align: right; }
  .logo-box img { height: 56px; width: auto; object-fit: contain; }
  .logo-box .tag { font-size: 11px; color: #64748b; margin-top: 4px; }
  .rule { border: none; border-top: 2px solid #1e2a4a; margin: 16px 0 24px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 32px; }
  .meta .lbl { font-size: 11px; color: #64748b; margin-bottom: 4px; }
  .meta .val { font-size: 14px; font-weight: 600; color: #1e2a4a; }
  .date-row { text-align: right; margin-bottom: 20px; font-size: 13px; color: #475569; }
  .date-row b { color: #1e2a4a; margin-left: 8px; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  table.items thead th { font-size: 12px; font-weight: 700; color: #1e2a4a; text-align: left; padding: 12px 10px; border-bottom: 2px solid #e2e8f0; }
  table.items thead th.r { text-align: right; }
  table.items thead th.c { text-align: center; }
  table.items td { padding: 14px 10px; border-bottom: 1px solid #eef2f6; font-size: 12.5px; vertical-align: top; }
  .c-name { width: 22%; } .c-name .nm { font-weight: 600; color: #1e2a4a; }
  .c-name .tp { font-size: 11px; color: #94a3b8; margin-top: 2px; }
  .c-desc { width: 38%; color: #475569; }
  .c-desc ul { padding-left: 16px; } .c-desc li { margin: 1px 0; }
  .c-qty { width: 8%; text-align: center; font-weight: 700; }
  .c-price { width: 16%; text-align: right; color: #475569; }
  .c-amt { width: 16%; text-align: right; font-weight: 700; color: #1e2a4a; }
  .bottom { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 8px; gap: 40px; }
  .pay { font-size: 12.5px; color: #475569; max-width: 280px; }
  .pay h4 { font-size: 12px; font-weight: 700; color: #1e2a4a; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
  .pay p { margin: 2px 0; }
  .pay .info-h { margin-top: 18px; }
  .summary { background: #1e2a4a; color: #fff; border-radius: 14px; padding: 22px 26px; min-width: 280px; }
  .summary .ln { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 10px; color: #cbd5e1; }
  .summary .ln b { color: #fff; font-weight: 600; }
  .summary .total { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid rgba(255,255,255,.2); padding-top: 12px; margin-top: 4px; }
  .summary .total span { font-size: 14px; }
  .summary .total b { font-size: 22px; font-weight: 800; }
  .print-bar { position: fixed; top: 0; left: 0; right: 0; background: #1e2a4a; color: #fff; padding: 12px; text-align: center; font-size: 13px; }
  .print-bar button { background: #fff; color: #1e2a4a; border: none; padding: 8px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; margin-left: 12px; }
  @media print { .print-bar { display: none; } body { padding: 24px 32px; } }
</style>
</head>
<body>
  <div class="print-bar">
    Tekan tombol untuk menyimpan sebagai PDF / cetak
    <button onclick="window.print()">🖨️ Print / Save PDF</button>
  </div>

  <div class="head">
    <div class="title">Invoice</div>
    <div class="logo-box">
      <img src="${origin}/logo.png" alt="New Wave Live"/>
      <div class="tag">New Wave Live Specialist</div>
    </div>
  </div>
  <hr class="rule"/>

  <div class="date-row">Tanggal: <b>${dateLabel}</b></div>

  <div class="meta">
    <div>
      <div class="lbl">Invoice To:</div>
      <div class="val">${esc(inv.invoice_to || inv.brand)}</div>
      <div class="lbl" style="margin-top:4px">${esc(inv.brand)}</div>
    </div>
    <div style="text-align:right">
      <div class="lbl">From</div>
      <div class="val">${esc(inv.bank_account_name || 'New Wave Live Specialist')}</div>
      <div class="lbl" style="margin-top:4px">No. Invoice: ${esc(inv.invoice_number)}</div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>NAME</th>
        <th>DESCRIPTION</th>
        <th class="c">QTY</th>
        <th class="r">PRICE</th>
        <th class="r">AMOUNT</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="bottom">
    <div class="pay">
      <h4>Payment Method</h4>
      <p>Bank Name: ${esc(inv.bank_name)}</p>
      <p>Account Name: ${esc(inv.bank_account_name)}</p>
      <p>Account Number: ${esc(inv.bank_account_number)}</p>
      <h4 class="info-h">More Information</h4>
      <p>${esc(inv.notes || 'For any question please contact us')}</p>
    </div>
    <div class="summary">
      <div class="ln"><span>Sub Total:</span><b>${rp(inv.sub_total)}</b></div>
      ${discountAmt > 0 ? `<div class="ln"><span>Discount ${inv.discount_pct}%</span><b>− ${rp(discountAmt)}</b></div>` : ''}
      ${inv.ppn_pct > 0 ? `<div class="ln"><span>PPN ${inv.ppn_pct}%</span><b>${rp(ppnAmt)}</b></div>` : ''}
      ${pphPct > 0 ? `<div class="ln"><span>PPH ${pphPct}%</span><b>− ${rp(pphAmt)}</b></div>` : ''}
      <div class="total"><span>Total Amount:</span><b>${rp(pphPct > 0 ? realTotal : inv.total_amount)}</b></div>
    </div>
  </div>

  <script>
    // Give the logo a moment to load before allowing print
    window.addEventListener('load', function () { setTimeout(function(){ /* ready */ }, 300) })
  </script>
</body>
</html>`

  const w = window.open('', '_blank', 'width=900,height=1200')
  if (!w) { alert('Popup diblokir. Izinkan popup untuk mencetak invoice.'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
