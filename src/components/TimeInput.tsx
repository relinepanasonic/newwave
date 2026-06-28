'use client'
// Custom 24-hour time picker — always HH:MM regardless of OS/browser locale.
import { useState, useRef, useEffect } from 'react'
import { Clock } from 'lucide-react'

interface Props {
  value: string          // "HH:MM" or ""
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

export default function TimeInput({ value, onChange, className, placeholder = 'HH:MM' }: Props) {
  const [open, setOpen] = useState(false)
  const [pendingH, setPendingH] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const hourRef = useRef<HTMLDivElement>(null)
  const minRef = useRef<HTMLDivElement>(null)

  const [selH, selM] = value ? value.split(':') : ['', '']
  // While picker is open, pendingH shadows selH for the hour highlight
  const displayH = open ? (pendingH || selH) : selH

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setPendingH('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Scroll selected item into view when opening
  useEffect(() => {
    if (!open) return
    setTimeout(() => {
      const hEl = hourRef.current?.querySelector('[data-selected]') as HTMLElement | null
      const mEl = minRef.current?.querySelector('[data-selected]') as HTMLElement | null
      hEl?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      mEl?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 50)
  }, [open])

  function handleOpen() {
    setPendingH(selH || '')
    setOpen(o => !o)
  }

  function pickHour(h: string) {
    setPendingH(h)
    // Update value immediately if minute already chosen, but keep picker open
    if (selM) onChange(`${h}:${selM}`)
  }

  function pickMin(m: string) {
    const h = pendingH || selH || '00'
    onChange(`${h}:${m}`)
    setOpen(false)
    setPendingH('')
  }

  return (
    <div ref={ref} className="relative">
      {/* Display field */}
      <button
        type="button"
        onClick={handleOpen}
        className={`w-full flex items-center justify-between text-left ${className ?? 'border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-400'}`}
      >
        <span className={value ? 'text-gray-900 font-medium' : 'text-gray-400'}>
          {value || placeholder}
        </span>
        <Clock size={14} className="text-gray-400 flex-shrink-0 ml-2" />
      </button>

      {/* Dropdown picker */}
      {open && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
          style={{ minWidth: '160px' }}>
          <div className="flex divide-x divide-gray-100">
            {/* Hours column */}
            <div ref={hourRef} className="flex-1 overflow-y-auto" style={{ height: '200px' }}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-center py-1.5 sticky top-0 bg-white border-b border-gray-50">
                Jam
              </p>
              {HOURS.map(h => (
                <button
                  key={h}
                  type="button"
                  data-selected={h === displayH ? '' : undefined}
                  onClick={() => pickHour(h)}
                  className={`w-full text-center py-1.5 text-sm transition-colors ${
                    h === displayH
                      ? 'bg-brand-600 text-white font-bold'
                      : 'hover:bg-brand-50 text-gray-700'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>

            {/* Minutes column */}
            <div ref={minRef} className="flex-1 overflow-y-auto" style={{ height: '200px' }}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-center py-1.5 sticky top-0 bg-white border-b border-gray-50">
                Menit
              </p>
              {MINUTES.map(m => (
                <button
                  key={m}
                  type="button"
                  data-selected={m === selM ? '' : undefined}
                  onClick={() => pickMin(m)}
                  className={`w-full text-center py-1.5 text-sm transition-colors ${
                    m === selM
                      ? 'bg-brand-600 text-white font-bold'
                      : 'hover:bg-brand-50 text-gray-700'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Clear button */}
          {value && (
            <button type="button" onClick={() => { onChange(''); setPendingH(''); setOpen(false) }}
              className="w-full text-xs text-gray-400 hover:text-red-500 py-2 border-t border-gray-100 transition-colors">
              Hapus
            </button>
          )}
        </div>
      )}
    </div>
  )
}
