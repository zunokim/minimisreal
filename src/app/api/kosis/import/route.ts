// src/app/api/kosis/import/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchKosisData, normalizeKosisRows } from '@/lib/kosis'
import type { KosisParamDataParams } from '@/lib/kosis'

export const dynamic = 'force-dynamic'

// 지원 데이터셋 매핑 (테이블명, 기본 지역키)
type DatasetKey = 'hcsi' | 'unsold'
const DATASET_CONF: Record<
  DatasetKey,
  { table: string; defaultRegionKey: 'C1' | 'C2' | 'C3' | (string & {}) }
> = {
  hcsi: { table: 'kosis_hcsi', defaultRegionKey: 'C1' },     // 시도
  unsold: { table: 'kosis_unsold', defaultRegionKey: 'C2' }, // 시군구
}

function parseBool(v: string | null): boolean {
  if (!v) return false
  return ['1', 'true', 'yes', 'y'].includes(v.toLowerCase())
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    // 1) 필수 파라미터
    const dataset = (searchParams.get('dataset') ?? '').trim() as DatasetKey
    const orgId = (searchParams.get('orgId') ?? '').trim()
    const tblId = (searchParams.get('tblId') ?? '').trim()

    if (!dataset || !(dataset in DATASET_CONF)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid dataset. Use one of: hcsi, unsold' },
        { status: 400 }
      )
    }
    if (!orgId || !tblId) {
      return NextResponse.json(
        { ok: false, error: 'Missing orgId or tblId' },
        { status: 400 }
      )
    }

    // 2) 기타 파라미터
    const prdSeRaw = (searchParams.get('prdSe') ?? 'M').toUpperCase()
    const prdSe = (['Y', 'H', 'Q', 'M', 'D', 'IR', 'F', 'S'].includes(prdSeRaw)
      ? prdSeRaw
      : 'M') as KosisParamDataParams['prdSe']

    const startPrdDe = searchParams.get('startPrdDe') ?? undefined
    const endPrdDe = searchParams.get('endPrdDe') ?? undefined
    const itmId = searchParams.get('itmId') ?? 'ALL'
    const objL1 = searchParams.get('objL1') ?? undefined
    const objL2 = searchParams.get('objL2') ?? undefined
    const objL3 = searchParams.get('objL3') ?? undefined

    const explicitRegionKey = searchParams.get('regionKey') ?? undefined
    const regionKey = (explicitRegionKey ||
      DATASET_CONF[dataset].defaultRegionKey) as 'C1' | 'C2' | 'C3' | string

    const dryRun = parseBool(searchParams.get('dryRun'))

    // 3) KOSIS 호출 파라미터 (✅ 정확한 타입으로 구성)
    const kosisParams: KosisParamDataParams = {
      orgId,
      tblId,
      prdSe,
      startPrdDe,
      endPrdDe,
      itmId,
      objL1,
      objL2,
      objL3,
      format: 'json',
    }

    // 4) KOSIS 데이터 호출
    const rawRows = await fetchKosisData(kosisParams)
    if (!Array.isArray(rawRows)) {
      return NextResponse.json(
        { ok: false, error: 'KOSIS returned non-array data' },
        { status: 502 }
      )
    }

    // 5) 정규화
    const normalized = normalizeKosisRows(rawRows, {
      orgId,
      tblId,
      regionKey,
    })

    // dryRun 이면 실제 DB 쓰기 없이 미리보기
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        mode: 'dryRun',
        count: normalized.length,
        params: { ...kosisParams, regionKey },
        preview: normalized.slice(0, 3),
      })
    }

    // 6) DB 업서트
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

    // 중복 키: org_id, tbl_id, prd_de, region_code, itm_id
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
      params: { ...kosisParams, regionKey },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
