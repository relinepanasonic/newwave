'use client'
// Rupiah amount input — shows Indonesian thousand-dot separators live as you type
// (e.g. typing "500000" displays "500.000"), with a built-in "Rp" prefix.
import { useState, useEffect } from 'react'

interface Props {
  value: number
  onChange: (value: number) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
  wrapperClassName?: string
  disabled?: boolean
  autoFocus?: boolean
  showPrefix?: boolean
}

function formatThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export default function CurrencyInput({ value, onChange, onBlur, placeholder, className, wrapperClassName, disabled, autoFocus, showPrefix = true }: Props) {
  const [text, setText] = useState(value ? formatThousands(String(value)) : '')

  // Keep the display in sync if `value` changes from outside (e.g. form reset)
  useEffect(() => {
    const digits = text.replace(/\./g, '')
    if (String(value || '') !== digits) {
      setText(value ? formatThousands(String(value)) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '')
    setText(digits ? formatThousands(digits) : '')
    onChange(digits ? parseInt(digits, 10) : 0)
  }

  return (
    <div className={wrapperClassName ?? `flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-400 bg-white ${disabled ? 'opacity-60' : ''}`}>
      {showPrefix && <span className="px-3 py-2.5 bg-gray-50 text-sm font-semibold text-gray-500 border-r border-gray-200 flex-shrink-0">Rp</span>}
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={className ?? 'flex-1 min-w-0 px-3 py-2.5 text-sm focus:outline-none'}
      />
    </div>
  )
}
