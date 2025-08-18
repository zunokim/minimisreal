import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/google'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin
    const redirectUri = `${origin}/api/google/oauth/callback`

    // getOAuthClient가 redirectUri를 받을 수 있도록 되어 있어야 합니다.
    const oauth2Client = getOAuthClient(redirectUri)

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar',
      ],
    })

    return NextResponse.redirect(url)
  } catch (e) {
    console.error('[oauth/start] error:', e)
    return NextResponse.redirect('/schedule?connected=0')
  }
}
