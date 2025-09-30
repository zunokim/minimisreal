// 코드 디렉토리: src/app/api/query/krx/monthly-listing/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startYm = searchParams.get('startYm')
    const endYm = searchParams.get('endYm')

    if (!startYm || !endYm) {
      return NextResponse.json({ error: 'PARAM_MISSING: startYm/endYm' }, { status: 400 })
    }
    // 간단 형식 검증 YYYY-MM
    const re = /^\d{4}-(0[1-9]|1[0-2])$/
    if (!re.test(startYm) || !re.test(endYm)) {
      return NextResponse.json({ error: 'PARAM_INVALID: YYYY-MM 형식을 사용하세요.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('krx_monthly_listing_stats')
      .select(
        [
          'prd_de',
          'market',
          'listed_count',
          'avg_capital_100b',
          'avg_mktcap_100b',
          'sum_mktcap_100b',
          'avg_offer_100b',
          'sum_offer_100b',
          'roll12_offer_trillion',
        ].join(','),
      )
      .gte('prd_de', startYm)
      .lte('prd_de', endYm)

    if (error) {
      return NextResponse.json({ error: 'DB_SELECT_FAILED', detail: error.message }, { status: 500 })
    }

    // 안전 정렬은 클라이언트에서 하지만, 서버에서도 최소 정렬
    const rows = (data ?? []).sort((a, b) => (a.prd_de < b.prd_de ? -1 : a.prd_de > b.prd_de ? 1 : 0))

    return NextResponse.json({ ok: true, rows })
  } catch (e) {
    return NextResponse.json({ error: 'UNEXPECTED', detail: (e as Error).message }, { status: 500 })
  }
}
