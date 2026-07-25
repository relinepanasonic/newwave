'use client'
// HH:MM time input with dedicated up/down steppers per field (hour steps by 1,
// wrapping 0-23; minute steps by 15, wrapping 00/15/30/45) -- for contexts
// where a scrollable dropdown (see TimeInput) is slower than tapping an arrow.
import { ChevronUp, ChevronDown } from 'lucide-react'

interface Props {
  value: string // "HH:MM" or ""
  onChange: (v: string) => void
  className?: string
}

function clampHour(h: number) { return ((h % 24) + 24) % 24 }
function clampMin(m: number) { return ((m % 60) + 60) % 60 }

export default function SteppedTimeInput({ value, onChange, className }: Props) {
  const [hStr, mStr] = value ? value.split(':') : ['00', '00']
  const h = Number(hStr) || 0
  const m = Number(mStr) || 0

  function set(nh: number, nm: number) {
    onChange(`${String(clampHour(nh)).padStart(2, '0')}:${String(clampMin(nm)).padStart(2, '0')}`)
  }
  function stepHour(dir: 1 | -1) { set(h + dir, m) }
  function stepMin(dir: 1 | -1) {
    // Round to the nearest 15 first so a manually-typed value snaps cleanly.
    const rounded = Math.round(m / 15) * 15
    set(h, rounded + dir * 15)
  }

  const box = className ?? 'border border-gray-200 rounded-xl bg-gray-50'

  return (
    <div className={`flex items-stretch justify-between gap-1.5 ${box}`}>
      <Segment label={String(h).padStart(2, '0')} onUp={() => stepHour(1)} onDown={() => stepHour(-1)}/>
      <span className="flex items-center text-gray-400 font-bold">:</span>
      <Segment label={String(m).padStart(2, '0')} onUp={() => stepMin(1)} onDown={() => stepMin(-1)}/>
    </div>
  )
}

function Segment({ label, onUp, onDown }: { label: string; onUp: () => void; onDown: () => void }) {
  return (
    <div className="flex items-center gap-1 flex-1 justify-center py-1">
      <span className="text-sm font-bold text-gray-900 tabular-nums w-6 text-center">{label}</span>
      <div className="flex flex-col">
        <button type="button" onClick={onUp} className="text-gray-400 hover:text-brand-600 leading-none p-0.5" tabIndex={-1}>
          <ChevronUp size={13}/>
        </button>
        <button type="button" onClick={onDown} className="text-gray-400 hover:text-brand-600 leading-none p-0.5" tabIndex={-1}>
          <ChevronDown size={13}/>
        </button>
      </div>
    </div>
  )
}
