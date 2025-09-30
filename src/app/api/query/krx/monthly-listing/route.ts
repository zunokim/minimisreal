// 코드 디렉토리: src/app/api/query/krx/monthly-listing/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type DbRow = {
  prd_de: string
  market: string
  listed_count: number | null
  avg_capital_100b: number | null
  avg_mktcap_100b: number | null
  sum_mktcap_100b: number | null
  avg_offer_100b: number | null
  sum_offer_100b: number | null
  roll12_offer_trillion: number | null
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startYm = searchParams.get('startYm')
    const endYm = searchParams.get('endYm')

    if (!startYm || !endYm) {
      return NextResponse.json({ error: 'PARAM_MISSING: startYm/endYm' }, { status: 400 })
    }
    const re = /^\d{4}-(0[1-9]|1[0-2])$/
    if (!re.test(startYm) || !re.test(endYm)) {
      return NextResponse.json({ error: 'PARAM_INVALID: YYYY-MM 형식을 사용하세요.' }, { status: 400 })
    }
    if (startYm > endYm) {
      return NextResponse.json({ error: 'PARAM_INVALID: 시작 월이 종료 월보다 이후입니다.' }, { status: 400 })
    }

    const query = supabaseAdmin
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

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: 'DB_SELECT_FAILED', detail: error.message }, { status: 500 })
    }

    const rows: DbRow[] = Array.isArray(data)
      ? (data as DbRow[]).slice().sort((a, b) => (a.prd_de < b.prd_de ? -1 : a.prd_de > b.prd_de ? 1 : 0))
      : []

    return NextResponse.json({ ok: true, rows })
  } catch (e) {
    return NextResponse.json({ error: 'UNEXPECTED', detail: (e as Error).message }, { status: 500 })
  }
}
