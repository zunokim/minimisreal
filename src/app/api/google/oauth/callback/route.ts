import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/google'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

type TokenRow = {
  label: string
  access_token: string | null
  refresh_token: string | null
  scope: string | null
  token_type: string | null
  expiry_date: number | null
  id_token?: string | null
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const errorParam = url.searchParams.get('error')

  if (errorParam || !code) {
    console.error('[oauth/callback] error/missing code:', errorParam)
    return NextResponse.redirect('/schedule?connected=0')
  }

  try {
    const origin = req.nextUrl.origin
    const redirectUri = `${origin}/api/google/oauth/callback`
    const oauth2Client = getOAuthClient(redirectUri)

    const { tokens } = await oauth2Client.getToken(code)

    // 기존 기록 병합 (refresh_token 없으면 기존 값 유지)
    const { data: prev } = await supabaseAdmin
      .from('google_oauth_tokens')
      .select('*')
      .eq('label', 'shared')
      .single()

    const payload: TokenRow = {
      label: 'shared',
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? prev?.refresh_token ?? null,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
      expiry_date: tokens.expiry_date ?? null,
      id_token: tokens.id_token ?? null,
    }

    const { error: upsertErr } = await supabaseAdmin
      .from('google_oauth_tokens')
      .upsert(payload, { onConflict: 'label' })

    if (upsertErr) {
      console.error('[oauth/callback] upsert error:', upsertErr)
      return NextResponse.redirect('/schedule?connected=0')
    }

    return NextResponse.redirect('/schedule?connected=1')
  } catch (e) {
    console.error('[oauth/callback] exception:', e)
    return NextResponse.redirect('/schedule?connected=0')
  }
}
