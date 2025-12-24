// src/app/api/kotc/term-market/query/route.ts
// 설명: DB 범위 조회 API (변경 없음)
// 보안: 읽기 API이므로 Admin 키로만 수행 (클라이언트에서 직접 Service Key 노출 금지)
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'edge'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const section = url.searchParams.get('section') ?? '전체'

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing from/to' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('kotc_term_market')
    .select('prd_de, section, avg_price, volume, amount_krw, market_cap_krw')
    .eq('section', section)
    .gte('prd_de', from)
    .lte('prd_de', to)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rows: data ?? [] })
}
