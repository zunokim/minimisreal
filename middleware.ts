import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/login/success']

export function middleware(request: NextRequest) {
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname)

  const token = request.cookies.get('sb-access-token')?.value

  if (!isPublic && !token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}
