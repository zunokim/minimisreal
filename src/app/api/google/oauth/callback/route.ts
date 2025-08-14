// src/app/api/google/oauth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/google'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { Credentials } from 'google-auth-library'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    if (!code) throw new Error('missing_code')

    const oauth2Client = getOAuthClient()
    const { tokens } = await oauth2Client.getToken(code) // exchanges code
    const creds: Credentials = tokens

    // 저장
    const { error } = await supabaseAdmin
      .from('google_oauth_tokens')
      .upsert(
        {
          label: 'shared',
          access_token: creds.access_token ?? null,
          refresh_token: creds.refresh_token ?? null,
          scope: creds.scope ?? null,
          token_type: creds.token_type ?? null,
          expiry_date: creds.expiry_date ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'label' }
      )
    if (error) throw error

    // 절대 URL로 리다이렉트
    const dest = new URL('/schedule?connected=1', url.origin).toString()
    return NextResponse.redirect(dest)
  } catch (e: unknown) {
    const url = new URL(req.url)
    const msg = (e as Error).message || 'oauth_callback_failed'
    const dest = new URL('/schedule?error=' + encodeURIComponent(msg), url.origin).toString()
    return NextResponse.redirect(dest)
  }
}
