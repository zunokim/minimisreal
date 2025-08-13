// src/app/api/kosis/import/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchKosisData, normalizeKosisRows } from '@/lib/kosis'
import type { KosisParamDataParams } from '@/lib/kosis'

export const dynamic = 'force-dynamic'

// 지원 데이터셋 매핑
type DatasetKey = 'hcsi' | 'unsold' | 'unsold_after'
const DATASET_CONF: Record<
  DatasetKey,
  { table: string; defaultRegionKey: 'C1' | 'C2' | 'C3' | (string & {}) }
> = {
  hcsi:         { table: 'kosis_hcsi',          defaultRegionKey: 'C1' }, // 시도
  unsold:       { table: 'kosis_unsold',        defaultRegionKey: 'C2' }, // 시군구
  unsold_after: { table: 'kosis_unsold_after',  defaultRegionKey: 'C2' }, // 공사완료후 미분양(시군구)
}

function parseBool(v: string | null): boolean {
  if (!v) return false
  return ['1', 'true', 'yes', 'y'].includes(v.toLowerCase())
}

// YYYYMM → 목록
function ymList(start?: string | null, end?: string | null): string[] {
  if (!start || !end) return []
  if (!/^\d{6}$/.test(start) || !/^\d{6}$/.test(end)) return []
  const y1 = Number(start.slice(0, 4)), m1 = Number(start.slice(4))
  const y2 = Number(end.slice(0, 4)), m2 = Number(end.slice(4))
  const begin = new Date(y1, m1 - 1, 1)
  const finish = new Date(y2, m2 - 1, 1)
  const arr: string[] = []
  for (let d = new Date(begin); d <= finish; d.setMonth(d.getMonth() + 1)) {
    arr.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return arr
}

// 공백/플러스 리스트 파라미터 전처리(꼬리 '+' 포함 정리)
function sanitizeListParam(v?: string | null): string | undefined {
  if (!v) return undefined
  const s = v.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim()
  return s || undefined
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    // 필수: dataset, orgId, tblId
    const dataset = (searchParams.get('dataset') ?? '').trim() as DatasetKey
    const orgId = (searchParams.get('orgId') ?? '').trim()
    const tblId = (searchParams.get('tblId') ?? '').trim()

    if (!dataset || !(dataset in DATASET_CONF)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid dataset. Use one of: hcsi, unsold, unsold_after' },
        { status: 400 }
      )
    }
    if (!orgId || !tblId) {
      return NextResponse.json({ ok: false, error: 'Missing orgId or tblId' }, { status: 400 })
    }

    // 기간(월 단위). 동일 월도 허용
    const startPrdDe = searchParams.get('startPrdDe')
    const endPrdDe = searchParams.get('endPrdDe')
    const months = ymList(startPrdDe, endPrdDe)
    if (months.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'startPrdDe/endPrdDe must be YYYYMM (same month allowed)' },
        { status: 400 }
      )
    }

    // 주기
    const prdSeRaw = (searchParams.get('prdSe') ?? 'M').toUpperCase()
    const prdSe = (['Y','H','Q','M','D','IR','F','S'].includes(prdSeRaw) ? prdSeRaw : 'M') as KosisParamDataParams['prdSe']

    // regionKey (정규화용)
    const explicitRegionKey = searchParams.get('regionKey') ?? undefined
    const regionKey = (explicitRegionKey || DATASET_CONF[dataset].defaultRegionKey) as 'C1' | 'C2' | 'C3' | string

    const dryRun = parseBool(searchParams.get('dryRun'))

    // ========== 파라미터 수집 ==========
    // 공통적으로 사용자가 직접 넘긴 값은 그대로 통과
    const userItmId = sanitizeListParam(searchParams.get('itmId'))
    const userObjL   = sanitizeListParam(searchParams.get('objL'))
    const userObjL1  = sanitizeListParam(searchParams.get('objL1'))
    const userObjL2  = sanitizeListParam(searchParams.get('objL2'))
    const userObjL3  = sanitizeListParam(searchParams.get('objL3'))
    const userObjL4  = sanitizeListParam(searchParams.get('objL4'))
    const userObjL5  = sanitizeListParam(searchParams.get('objL5'))
    const userObjL6  = sanitizeListParam(searchParams.get('objL6'))
    const userObjL7  = sanitizeListParam(searchParams.get('objL7'))
    const userObjL8  = sanitizeListParam(searchParams.get('objL8'))
    const newEstPrdCnt = sanitizeListParam(searchParams.get('newEstPrdCnt'))

    // 데이터셋별 기본값(없으면 그대로 undefined → KOSIS가 에러 주면 그때 교정)
    const defaultsFor: Partial<Record<DatasetKey, Partial<KosisParamDataParams>>> = {
      // 기존 unsold/hcsi는 ALL 허용 표(이미 정상 동작하던 구성)
      hcsi: {
        itmId: userItmId ?? 'ALL',
        objL1: userObjL1 ?? 'ALL',
        objL2: userObjL2 ?? undefined,
        objL3: userObjL3 ?? undefined,
      },
      unsold: {
        itmId: userItmId ?? 'ALL',
        objL1: userObjL1 ?? 'ALL',
        objL2: userObjL2 ?? 'ALL',
        objL3: userObjL3 ?? undefined,
      },
      // 공사완료후 미분양: 주신 고정 코드 기본값(민간/전국/예시 세부값)
      unsold_after: {
        itmId: userItmId ?? '13103871088T1',
        objL1: userObjL1 ?? '13102871088A.0001', // 전국
        objL2: userObjL2 ?? '13102871088B.0001', // 민간부문
        objL3: userObjL3 ?? '13102871088C.0001 13102871088C.0003', // 예시(복수 가능)
        objL4: userObjL4 ?? '13102871088D.0003', // 예시
        objL5: userObjL5 ?? undefined,
        objL6: userObjL6 ?? undefined,
        objL7: userObjL7 ?? undefined,
        objL8: userObjL8 ?? undefined,
      },
    }

    const baseDefaults = defaultsFor[dataset] ?? {}

    const attempts: Array<{ scope: string; ok: boolean; error?: string; count?: number; usedParams?: Partial<KosisParamDataParams> }> = []
    const allRows: any[] = []

    // 월별 호출(대용량 회피, 에러/HTML 응답은 lib/kosis가 처리)
    for (const ym of months) {
      const params: KosisParamDataParams = {
        orgId,
        tblId,
        prdSe,
        startPrdDe: ym,
        endPrdDe: ym,
        // 우선순위: 사용자 입력 > 데이터셋 기본
        itmId: userItmId ?? baseDefaults.itmId,
        objL:  userObjL  ?? baseDefaults.objL,
        objL1: userObjL1 ?? baseDefaults.objL1,
        objL2: userObjL2 ?? baseDefaults.objL2,
        objL3: userObjL3 ?? baseDefaults.objL3,
        objL4: userObjL4 ?? baseDefaults.objL4,
        objL5: userObjL5 ?? baseDefaults.objL5,
        objL6: userObjL6 ?? baseDefaults.objL6,
        objL7: userObjL7 ?? baseDefaults.objL7,
        objL8: userObjL8 ?? baseDefaults.objL8,
        newEstPrdCnt: newEstPrdCnt,
        format: 'json',
      }

      try {
        const rows = await fetchKosisData(params) // ← 느슨한 파서 사용 (HTML/비표준 JSON 방어)
        const count = Array.isArray(rows) ? rows.length : 0
        allRows.push(...(rows ?? []))
        attempts.push({ scope: ym, ok: true, count, usedParams: { ...params } })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        attempts.push({ scope: ym, ok: false, error: msg, usedParams: { ...params } })
        return NextResponse.json(
          { ok: false, error: `월 ${ym} 호출 실패: ${msg}`, attempts },
          { status: 502 }
        )
      }
    }

    // 정규화 → (dryRun이면 미리보기만)
    const normalized = normalizeKosisRows(allRows as any[], {
      orgId,
      tblId,
      regionKey,
    })

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        mode: 'dryRun',
        months: months.length,
        totalRows: normalized.length,
        attempts,
        preview: normalized.slice(0, 5),
      })
    }

    // DB 업서트
    const table = DATASET_CONF[dataset].table
    const rowsToInsert = normalized.map((r) => ({
      org_id: r.org_id,
      tbl_id: r.tbl_id,
      prd_se: r.prd_se,
      prd_de: r.prd_de,
      region_code: r.region_code,
      region_name: r.region_name,
      itm_id: r.itm_id,
      itm_name: r.itm_name,
      unit: r.unit,
      value: r.value,
    }))

    const { error: upErr, count } = await supabaseAdmin
      .from(table)
      .upsert(rowsToInsert, {
        onConflict: 'org_id,tbl_id,prd_de,region_code,itm_id',
        ignoreDuplicates: false,
        count: 'exact',
      })

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      inserted: count ?? rowsToInsert.length,
      table,
      months: months.length,
      attempts,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
