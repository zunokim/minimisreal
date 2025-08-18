// src/app/api/google/oauth/callback/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/google'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { Credentials } from 'google-auth-library'

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin

  // 구글 에러 쿼리 즉시 핸들
  const errorParam = req.nextUrl.searchParams.get('error')
  if (errorParam) {
    return NextResponse.redirect(
      `${origin}/schedule?connected=0&error=${encodeURIComponent(errorParam)}`
    )
  }

  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(
      `${origin}/schedule?connected=0&error=missing_code`
    )
  }

  try {
    // env 기반 OAuth2 클라이언트 (src/lib/google.ts 시그니처에 맞춤)
    const oauth2Client = getOAuthClient()

    // 코드 → 토큰 교환
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    // 토큰 타입 지정 (any 금지)
    const t = tokens as Credentials

    // Supabase 저장 (label='shared' 1행 사용)
    const { error: upsertErr } = await supabaseAdmin
      .from('google_oauth_tokens')
      .upsert(
        {
          label: 'shared',
          access_token: t.access_token ?? null,
          refresh_token: t.refresh_token ?? null,
          scope: t.scope ?? null,
          token_type: t.token_type ?? null,
          expiry_date: t.expiry_date ?? null,
          id_token: t.id_token ?? null,
        },
        { onConflict: 'label' }
      )

    if (upsertErr) {
      return NextResponse.redirect(
        `${origin}/schedule?connected=0&error=${encodeURIComponent('save_failed:' + upsertErr.message)}`
      )
    }

    return NextResponse.redirect(`${origin}/schedule?connected=1`)
  } catch (e: unknown) {
    // any 없이 안전한 추론
    let msg = 'oauth_callback_failed'
    if (typeof e === 'object' && e !== null) {
      const errObj = e as {
        message?: string
        response?: {
          data?: {
            error?: { message?: string }
            error_description?: string
            error?: string
          }
        }
      }
      msg =
        errObj.response?.data?.error_description ||
        errObj.response?.data?.error ||
        errObj.response?.data?.error?.message ||
        errObj.message ||
        msg
    }
    return NextResponse.redirect(
      `${origin}/schedule?connected=0&error=${encodeURIComponent(msg)}`
    )
  }
}
