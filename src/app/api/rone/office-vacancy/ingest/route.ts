// src/app/api/rone/office-vacancy/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  roneFetchAllRows,
  parseQuarter,
  pickVacancyStatblId,
  filterSeoulHubsForQuarter,
  toQuarterDesc,
  type RoneRow,
} from '@/lib/rone'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function samplePeriods(rows: RoneRow[], limit = 10) {
  const m = new Map<string, string>()
  for (const r of rows) {
    const id = r.WRTTIME_IDTFR_ID
    const desc = r.WRTTIME_DESC ?? ''
    if (!m.has(id)) m.set(id, desc)
    if (m.size >= limit) break
  }
  return Array.from(m, ([id, desc]) => ({ id, desc }))
}

function sampleRegions(rows: RoneRow[], limit = 12) {
  const s = new Set<string>()
  for (const r of rows) {
    const nm = r.CLS_FULLNM || r.CLS_NM || ''
    if (nm) s.add(nm)
    if (s.size >= limit) break
  }
  return Array.from(s)
}

export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const debug = q.get('debug') === '1'
  const dryRun = q.get('dryRun') === '1' || debug // debug면 자동 dryRun

  try {
    const body = await req.json().catch(() => ({}))
    const periodRaw = String(body?.period ?? '').trim()
    if (!periodRaw) {
      return NextResponse.json({ error: 'period 가 필요합니다. 예: 202403 (YYYYMM 또는 YYYYQ)' }, { status: 400 })
    }

    const { year, q: quarter } = parseQuarter(periodRaw)
    const statblId = pickVacancyStatblId(year, quarter)

    // 1) R-ONE 전량 수집 (1,000건 페이지네이션)
    const allRows = await roneFetchAllRows({
      STATBL_ID: statblId,
      DTACYCLE_CD: 'QY',
      pageSize: 1000,
      maxPages: 200,
    })

    // 디버그용 샘플
    const periods = samplePeriods(allRows)
    const regions = sampleRegions(allRows)

    // 2) 해당 분기의 서울 3핵심(CBD/KBD/YBD) 선택 (관대한 매칭)
    const hubs = filterSeoulHubsForQuarter(allRows, year, quarter)

    // 저장 payload (우리 스키마에 맞춤: wrttime_desc 컬럼 사용)
    const payload = hubs.map((h) => ({
      period: h.period,                      // 202403 / 202406 / 202409 / 202412 등
      wrttime_desc: h.period_desc ?? toQuarterDesc(year, quarter), // 화면 표기용
      region_code: h.region_code,            // CBD / KBD / YBD
      region_name: h.region_name,
      value: h.value,
      unit: h.unit,                          // 화면에는 숨겨도 DB엔 저장
      source_statbl_id: statblId,
      source_dtacycle_cd: 'QY',
      raw: h.raw as any,                     // 원본 한 줄
    }))

    // 디버그/드라이런: DB 쓰지 않고 상태만 반환
    if (dryRun) {
      return NextResponse.json({
        period_input: periodRaw,
        resolved: { year, quarter, statblId },
        counts: {
          fetched_total: allRows.length,
          hubs_selected: hubs.length, // 기대값: 3
        },
        samples: { periods, regions },
        hubs,       // 선택된 3개 허브의 스냅샷(값/원시 포함)
        payload,    // upsert 직전 페이로드
        note: 'dryRun/debug 모드에서는 DB에 적재하지 않습니다.',
      })
    }

    // 3) DB upsert
    const { data, error } = await supabase
      .from('rone_office_vacancy')
      .upsert(payload, { onConflict: 'period,region_code' })
      .select()

    if (error) {
      // 흔한 원인 메시지를 사람이 읽기 좋게 가공
      const msg = String(error.message || error)
      const hint =
        /no unique or exclusion constraint/i.test(msg)
          ? '테이블에 UNIQUE (period, region_code)가 없으면 upsert가 실패합니다. \n' +
            '다음 SQL을 실행하세요:\n' +
            "ALTER TABLE public.rone_office_vacancy ADD CONSTRAINT rone_office_vacancy_period_region_key UNIQUE (period, region_code);\n" +
            "NOTIFY pgrst, 'reload schema';"
          : undefined

      // 콘솔에도 자세히 남기기
      console.error('[office-vacancy ingest] upsert error:', {
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        code: (error as any).code,
      })

      return NextResponse.json(
        {
          error: 'DB upsert 실패',
          supabase: {
            message: error.message,
            details: (error as any).details,
            hint: (error as any).hint ?? hint,
            code: (error as any).code,
          },
          context: {
            period_input: periodRaw,
            resolved: { year, quarter, statblId },
            fetched_total: allRows.length,
            hubs_selected: hubs.length,
            sample_periods: periods,
          },
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      period: periodRaw,
      info: { year, quarter, statblId },
      count: data?.length ?? 0,
      rows: data ?? [],
    })
  } catch (err: any) {
    console.error('[office-vacancy ingest] fatal error:', err)
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}
