'use client'
// Numeric input with an up/down stepper button pair, for values that should
// snap to a fixed increment (e.g. duration in 15-minute/0.25h steps).
import { ChevronUp, ChevronDown } from 'lucide-react'

interface Props {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  placeholder?: string
  className?: string
}

export default function SteppedNumberInput({ value, onChange, step = 1, min = 0, max = Infinity, placeholder, className }: Props) {
  function round(n: number) {
    const decimals = step.toString().split('.')[1]?.length || 0
    return Number(n.toFixed(decimals))
  }
  function clamp(n: number) { return Math.min(max, Math.max(min, round(n))) }
  function bump(dir: 1 | -1) { onChange(clamp((value || 0) + dir * step)) }

  const box = className ?? 'border border-gray-200 rounded-xl bg-gray-50'

  return (
    <div className={`flex items-center justify-between gap-2 px-3 ${box}`}>
      <input
        type="number" inputMode="decimal" min={min} max={max} step={step}
        value={value || ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value === '' ? 0 : clamp(parseFloat(e.target.value)))}
        className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <div className="flex flex-col flex-shrink-0">
        <button type="button" onClick={() => bump(1)} className="text-gray-400 hover:text-brand-600 leading-none p-0.5" tabIndex={-1}>
          <ChevronUp size={13}/>
        </button>
        <button type="button" onClick={() => bump(-1)} className="text-gray-400 hover:text-brand-600 leading-none p-0.5" tabIndex={-1}>
          <ChevronDown size={13}/>
        </button>
      </div>
    </div>
  )
}
