// src/app/api/google/oauth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/google'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code')
    if (!code) throw new Error('missing_code')

    const oauth2 = getOAuthClient()
    const { tokens } = await oauth2.getToken(code)

    // 기존 저장값 조회 (refresh_token 보존용)
    const { data: existing } = await supabaseAdmin
      .from('google_oauth_tokens')
      .select('*')
      .eq('label', 'shared')
      .single()

    const payload = {
      label: 'shared',
      access_token: tokens.access_token ?? existing?.access_token ?? null,
      refresh_token: tokens.refresh_token ?? existing?.refresh_token ?? null, // ✅ 없으면 기존 유지
      scope: Array.isArray(tokens.scope) ? tokens.scope.join(' ') : (tokens.scope ?? existing?.scope ?? null),
      token_type: tokens.token_type ?? existing?.token_type ?? null,
      expiry_date: tokens.expiry_date ?? existing?.expiry_date ?? null,
      id_token: tokens.id_token ?? existing?.id_token ?? null,
    }

    // upsert
    const { error } = await supabaseAdmin
      .from('google_oauth_tokens')
      .upsert(payload, { onConflict: 'label' })

    if (error) throw error

    // 연결 완료 후 돌아갈 곳
    return NextResponse.redirect(new URL('/schedule?connected=1', req.url))
  } catch (err) {
    return NextResponse.redirect(new URL('/schedule?connected=0', req.url))
  }
}
