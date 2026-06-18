import { NextResponse } from 'next/server'

// Minimal middleware - no auth checks, let client handle it
export function middleware() {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
