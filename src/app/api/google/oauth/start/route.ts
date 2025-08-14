// src/app/api/google/oauth/start/route.ts
import { NextResponse } from 'next/server'
import { getOAuthClient, CALENDAR_SCOPES } from '@/lib/google'

export async function GET() {
  try {
    const oauth2Client = getOAuthClient()
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: CALENDAR_SCOPES,
      prompt: 'consent',
    })
    return NextResponse.redirect(url)
  } catch (e: any) {
    console.error('[oauth/start] error:', e)
    return NextResponse.json({ error: e?.message || 'oauth_start_failed' }, { status: 500 })
  }
}
