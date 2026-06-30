import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// iCal text escaping
function esc(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// Format Date to iCal local datetime string: YYYYMMDDTHHMMSS
function icalDateTime(dateStr: string, timeStr: string): string {
  // dateStr: YYYY-MM-DD, timeStr: HH:MM
  const [y, m, d] = dateStr.split('-')
  const [h, min] = (timeStr || '00:00').split(':')
  return `${y}${m}${d}T${String(h).padStart(2,'0')}${String(min || '0').padStart(2,'0')}00`
}

// Add hours to a dateStr+timeStr, returns new {dateStr, timeStr}
function addHours(dateStr: string, timeStr: string, hours: number): { date: string; time: string } {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = (timeStr || '00:00').split(':').map(Number)
  const totalMin = h * 60 + (mi || 0) + Math.round(hours * 60)
  const extraDays = Math.floor(totalMin / (24 * 60))
  const remMin = totalMin % (24 * 60)
  const dt = new Date(y, mo - 1, d + extraDays)
  const nh = Math.floor(remMin / 60)
  const nm = remMin % 60
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`,
    time: `${pad2(nh)}:${pad2(nm)}`,
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { hostId: string } }
) {
  const hostId = params.hostId

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch host profile
  const { data: host } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', hostId)
    .in('role', ['host', 'superadmin'])
    .single()

  if (!host) {
    return new Response('Host not found', { status: 404 })
  }

  // Fetch slots: 30 days past + 90 days future
  const pastDate = new Date(); pastDate.setDate(pastDate.getDate() - 30)
  const futureDate = new Date(); futureDate.setDate(futureDate.getDate() + 90)
  const pad = (n: number) => String(n).padStart(2,'0')
  const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`

  const q = supabase
    .from('schedule_slots')
    .select('id, slot_date, session_no, brand, platform, konsep, background, kostum, gimmick, jam_mulai, durasi, status, rooms(name)')
    .gte('slot_date', toStr(pastDate))
    .lte('slot_date', toStr(futureDate))
    .not('brand', 'is', null)
    .order('slot_date').order('session_no')

  if (host.role === 'host') {
    q.eq('host_id', hostId)
  }

  const { data: slots } = await q
  const rows = (slots || []) as any[]

  // Build VEVENT blocks
  const events = rows.map(slot => {
    // Compute start time
    let startTime: string
    if (slot.jam_mulai) {
      startTime = slot.jam_mulai.slice(0, 5) // HH:MM
    } else {
      const h = Math.floor((slot.session_no - 1))
      startTime = `${String(h).padStart(2,'0')}:00`
    }
    const durasi = slot.durasi && slot.durasi > 0 ? slot.durasi : 1
    const end = addHours(slot.slot_date, startTime, durasi)

    const dtStart = icalDateTime(slot.slot_date, startTime)
    const dtEnd   = icalDateTime(end.date, end.time)

    const summary = [slot.brand, slot.platform].filter(Boolean).join(' · ')
    const room = (slot.rooms as any)?.name || ''
    const descParts = [
      room && `Room: ${room}`,
      slot.konsep && `Konsep: ${slot.konsep}`,
      slot.background && `Background: ${slot.background}`,
      slot.kostum && `Kostum: ${slot.kostum}`,
      slot.gimmick && `Gimmick: ${slot.gimmick}`,
      `Status: ${slot.status}`,
    ].filter(Boolean)

    return [
      'BEGIN:VEVENT',
      `UID:${slot.id}@nwschedule`,
      `DTSTART;TZID=Asia/Jakarta:${dtStart}`,
      `DTEND;TZID=Asia/Jakarta:${dtEnd}`,
      `SUMMARY:${esc(summary)}`,
      `DESCRIPTION:${esc(descParts.join('\\n'))}`,
      room ? `LOCATION:${esc(room)}` : '',
      `STATUS:${slot.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      // Alarm: 1 day before
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:Besok Live! ${esc(summary)}`,
      'TRIGGER:-P1D',
      'END:VALARM',
      // Alarm: 1 hour before
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:Live 1 jam lagi! ${esc(summary)}`,
      'TRIGGER:-PT1H',
      'END:VALARM',
      'END:VEVENT',
    ].filter(Boolean).join('\r\n')
  })

  const calName = `NW Schedule${host.role === 'host' ? ` – ${host.full_name}` : ''}`

  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//New Wave Live Specialist//NW Schedule//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-WR-TIMEZONE:Asia/Jakarta',
    'X-WR-CALDESC:Jadwal Live NW Schedule',
    // Timezone definition for Asia/Jakarta (WIB, UTC+7, no DST)
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Jakarta',
    'BEGIN:STANDARD',
    'TZNAME:WIB',
    'TZOFFSETFROM:+0700',
    'TZOFFSETTO:+0700',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')

  return new Response(ical, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="nw-schedule-${host.full_name?.replace(/\s+/g, '-') || hostId}.ics"`,
      // Don't cache — Google Calendar polls this URL directly
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
