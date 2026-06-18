import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NW Schedule — New Wave Live Specialist',
  description: 'Schedule & payroll management for live streaming hosts',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
