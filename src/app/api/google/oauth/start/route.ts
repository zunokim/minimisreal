// src/app/api/google/oauth/start/route.ts
import { NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/google'

export const runtime = 'nodejs'

export async function GET() {
  const oauth2 = getOAuthClient()
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',           // ✅ refresh token 받기
    prompt: 'consent',                // ✅ 재동의 유도 (최초 1회 확실)
    include_granted_scopes: true,
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
  })
  return NextResponse.redirect(url)
}
