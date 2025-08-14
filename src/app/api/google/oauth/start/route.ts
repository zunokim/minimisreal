// src/app/api/google/oauth/start/route.ts
import { NextResponse, NextRequest } from 'next/server'
import { getOAuthClient } from '@/lib/google'

export async function GET(_req: NextRequest) {
  try {
    const oauth2Client = getOAuthClient()
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar'],
    })
    return NextResponse.redirect(url)
  } catch (e: unknown) {
    const msg = (e as Error).message || 'oauth_start_failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
