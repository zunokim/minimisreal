// src/app/api/google/oauth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/google'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function abs(url: string, base: string) {
  // 상대 경로('/schedule?...') → 절대 URL로 변환
  return new URL(url, base)
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  // 절대 URL의 base (http://localhost:3000 또는 배포 도메인)
  const base = url.origin

  if (error) {
    console.error('[oauth/callback] error query:', error)
    return NextResponse.redirect(abs(`/schedule?error=${encodeURIComponent(error)}`, base))
  }
  if (!code) {
    console.error('[oauth/callback] missing code.')
    return NextResponse.redirect(abs('/schedule?error=missing_code', base))
  }

  try {
    const oauth2Client = getOAuthClient()

    // ⚠️ code는 1회성입니다.
    const { tokens } = await oauth2Client.getToken(code)

    // 토큰 저장 (label='shared')
    const { error: dbError } = await supabaseAdmin
      .from('google_oauth_tokens')
      .upsert(
        {
          label: 'shared',
          access_token: tokens.access_token ?? null,
          refresh_token: tokens.refresh_token ?? null,
          scope: tokens.scope ?? null,
          token_type: tokens.token_type ?? null,
          expiry_date: tokens.expiry_date ?? null,
        },
        { onConflict: 'label' }
      )

    if (dbError) {
      console.error('[oauth/callback] upsert error:', dbError)
      return NextResponse.redirect(abs(`/schedule?error=${encodeURIComponent(dbError.message)}`, base))
    }

    return NextResponse.redirect(abs('/schedule?connected=1', base))
  } catch (e: any) {
    // 대표적으로: redirect_uri_mismatch / invalid_grant / env 누락
    console.error('[oauth/callback] exception:', e?.response?.data || e)
    const msg =
      e?.response?.data?.error_description ||
      e?.response?.data?.error ||
      e?.message ||
      'oauth_callback_failed'
    return NextResponse.redirect(abs(`/schedule?error=${encodeURIComponent(msg)}`, base))
  }
}
