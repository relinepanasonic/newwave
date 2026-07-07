import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Body: { brand?, platform?, month_start, month_end }
// Fetches the raw data behind a client performance report (live_reports +
// live_report_products), including the host's name.
//
// Uses the service role because:
// - A 'client' caller may only read their OWN profile row (RLS), so we force
//   their brand server-side instead of trusting the request body.
// - host_manager/operator are not superadmin, so RLS would block embedding
//   profiles(full_name) for the host lookup if we ran this as their own user.
export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('profiles').select('role, client_brand').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { brand, platform, month_start, month_end } = await req.json()
  if (!month_start || !month_end) {
    return NextResponse.json({ error: 'month_start and month_end required' }, { status: 400 })
  }

  let effectiveBrand: string | null = null
  if (me.role === 'client') {
    effectiveBrand = me.client_brand
  } else if (['superadmin', 'host_manager', 'operator'].includes(me.role)) {
    effectiveBrand = brand || null
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!effectiveBrand) {
    return NextResponse.json({ error: 'Brand tidak ditemukan' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let q = admin.from('live_reports')
    .select('id, report_date, brand, platform, start_time, duration_hours, gmv, impression, viewer, trans, comment_count, product_sold_name, notes, host_id, profiles:host_id(full_name)')
    .eq('brand', effectiveBrand)
    .gte('report_date', month_start).lte('report_date', month_end)
    .order('report_date', { ascending: true }).order('start_time', { ascending: true })
  if (platform) q = q.eq('platform', platform)

  const { data: reports, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (reports || []).map(r => r.id)
  let products: any[] = []
  if (ids.length) {
    const { data: prods } = await admin.from('live_report_products')
      .select('id, live_report_id, produk_terjual, product_klik, item_sold, total')
      .in('live_report_id', ids)
    products = prods || []
  }

  return NextResponse.json({ brand: effectiveBrand, reports: reports || [], products })
}
