// src/app/api/login/route.ts
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const token: string | undefined = body?.access_token

  if (!token) {
    return NextResponse.json({ error: 'missing access_token' }, { status: 400 })
  }

  // 응답을 만들고, 응답의 cookies에 set
  const res = NextResponse.json({ ok: true })

  res.cookies.set({
    name: 'sb-access-token',
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7일
  })

  return res
}
