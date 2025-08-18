export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/google'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/google/oauth/callback`

  const error = req.nextUrl.searchParams.get('error')
  if (error) {
    return NextResponse.redirect(`${origin}/schedule?connected=0&error=${encodeURIComponent(error)}`)
  }

  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(`${origin}/schedule?connected=0&error=missing_code`)
  }

  try {
    const oauth2Client = getOAuthClient(redirectUri)
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    // 저장 (label='shared' 1행만 사용)
    const { error: upsertErr } = await supabaseAdmin
      .from('google_oauth_tokens')
      .upsert({
        label: 'shared',
        access_token: tokens.access_token ?? null,
        refresh_token: tokens.refresh_token ?? null,
        scope: tokens.scope ?? null,
        token_type: tokens.token_type ?? null,
        expiry_date: tokens.expiry_date ?? null,
        id_token: tokens.id_token ?? null,
      }, { onConflict: 'label' })

    if (upsertErr) {
      return NextResponse.redirect(
        `${origin}/schedule?connected=0&error=${encodeURIComponent('save_failed:' + upsertErr.message)}`
      )
    }

    return NextResponse.redirect(`${origin}/schedule?connected=1`)
  } catch (e) {
    const msg =
      (e as any)?.response?.data?.error_description ||
      (e as any)?.response?.data?.error ||
      (e as any)?.message ||
      'oauth_callback_failed'
    return NextResponse.redirect(`${origin}/schedule?connected=0&error=${encodeURIComponent(msg)}`)
  }
}
