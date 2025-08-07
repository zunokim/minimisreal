import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = await req.json()
  const token = body.access_token

  if (!token) {
    return NextResponse.json({ success: false, message: 'No token provided' }, { status: 400 })
  }

  // ✅ 토큰을 HTTP-only 쿠키로 저장
  cookies().set('sb-access-token', token, {
    httpOnly: true,
    path: '/',
    secure: true,
    maxAge: 60 * 60 * 24 * 7, // 7일
  })

  return NextResponse.json({ success: true })
}
