import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const access = body?.access_token as string | undefined
  const refresh = body?.refresh_token as string | undefined

  if (!access || !refresh) {
    return NextResponse.json({ error: 'missing tokens' }, { status: 400 })
  }

  const isProd = process.env.NODE_ENV === 'production'
  const res = NextResponse.json({ ok: true })

  // access 토큰 (유효기간 짧음)
  res.cookies.set({
    name: 'sb-access-token',
    value: access,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,     // Vercel(HTTPS)에서는 true, 로컬 HTTP에선 false
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7일
  })

  // refresh 토큰 (유효기간 김)
  res.cookies.set({
    name: 'sb-refresh-token',
    value: refresh,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30일
  })

  return res
}
