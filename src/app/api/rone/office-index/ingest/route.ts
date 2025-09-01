// src/app/api/rone/office-index/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  roneFetchAllRows,
  parseQuarter,
  filterSeoulIndexAnchorsForQuarter,
} from '@/lib/rone'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const periodRaw = String(body?.period ?? '').trim()
    if (!periodRaw) {
      return NextResponse.json({ error: 'period 가 필요합니다.' }, { status: 400 })
    }

    const { year, q } = parseQuarter(periodRaw)

    // 여러 키 이름 허용(과거 호환)
    const STATBL_ID =
      process.env.RONE_OFFICE_INDEX_STATBL_ID ||
      process.env.RONE_OFFICE_STATBL_ID ||
      process.env.NEXT_PUBLIC_RONE_OFFICE_STATBL_ID ||
      process.env.NEXT_PUBLIC_RONE_STATBL_ID ||
      ''

    if (!STATBL_ID) {
      return NextResponse.json(
        { error: '임대가격지수 STATBL_ID 환경변수가 없습니다.' },
        { status: 500 }
      )
    }

    // 페이지네이션 수집(1,000건 제한 회피)
    const rows = await roneFetchAllRows({
      STATBL_ID,
      DTACYCLE_CD: 'QY',
      pageSize: 1000,
      maxPages: 200,
    })

    const hubs = filterSeoulIndexAnchorsForQuarter(rows, year, q)
    if (hubs.length === 0) {
      return NextResponse.json(
        {
          period: periodRaw,
          info: { year, quarter: q, statbl: STATBL_ID, message: '해당 분기 데이터가 발견되지 않았습니다.' },
          count: 0,
          rows: [],
        },
        { status: 200 }
      )
    }

    // ✅ 기존 스키마 호환: wrttime_desc 컬럼에 저장
    const payload = hubs.map((h) => ({
      period: h.period,               // 202403/202409 등
      wrttime_desc: h.period_desc,    // ← DB 컬럼명에 맞춤
      region_code: h.region_code,     // CBD/KBD/YBD
      region_name: h.region_name,
      value: h.value,
      unit: h.unit,                   // 화면 표기는 숨겨도 DB엔 저장
      source_statbl_id: STATBL_ID,
      source_dtacycle_cd: 'QY',
      raw: h.raw as any,
    }))

    const { data, error } = await supabase
      .from('rone_office_index')
      .upsert(payload, { onConflict: 'period,region_code' })
      .select()

    if (error) throw error

    return NextResponse.json({
      period: periodRaw,
      info: { year, quarter: q, statbl: STATBL_ID },
      count: data?.length ?? 0,
      rows: data ?? [],
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
