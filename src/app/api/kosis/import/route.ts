// src/app/api/kosis/import/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchKosisData, normalizeKosisRows } from '@/lib/kosis'

export const dynamic = 'force-dynamic'

function pickImportTable(dataset: string) {
  if (dataset === 'hcsi') return 'kosis_hcsi'
  if (dataset === 'unsold') return 'kosis_unsold'
  throw new Error('dataset must be "hcsi" or "unsold"')
}

function toErrMessage(e: unknown) {
  if (e instanceof Error) return e.message
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const dataset = searchParams.get('dataset') // hcsi | unsold
  const orgId = searchParams.get('orgId')
  const tblId = searchParams.get('tblId')
  const prdSe = searchParams.get('prdSe') // M/Q/Y
  const startPrdDe = searchParams.get('startPrdDe')
  const endPrdDe = searchParams.get('endPrdDe')
  const newEstPrdCnt = searchParams.get('newEstPrdCnt') // 최신 N건
  const itmId = searchParams.get('itmId') // ALL or code
  const regionKey = (searchParams.get('regionKey') as 'C1' | 'C2' | 'C3' | null) ?? 'C1'
  const dryRun = searchParams.get('dryRun') === '1' // 미리보기 모드

  // ✅ objL & objL1~objL8 모두 수용
  const objParams: Record<string, string> = {}
  const objL = searchParams.get('objL')
  if (objL) objParams['objL'] = objL
  ;['objL1','objL2','objL3','objL4','objL5','objL6','objL7','objL8'].forEach((k) => {
    const v = searchParams.get(k)
    if (v) objParams[k] = v
  })

  if (!dataset || !orgId || !tblId || !prdSe) {
    return NextResponse.json(
      { ok: false, error: '필수: dataset, orgId, tblId, prdSe' },
      { status: 400 }
    )
  }
  if (!startPrdDe && !newEstPrdCnt) {
    return NextResponse.json(
      { ok: false, error: '기간 지정 필요: startPrdDe/endPrdDe 또는 newEstPrdCnt' },
      { status: 400 }
    )
  }

  try {
    // 1) KOSIS 호출 파라미터 구성
    const params: Record<string, string> = { orgId, tblId, prdSe, format: 'json', ...objParams }
    if (itmId) params.itmId = itmId
    if (startPrdDe) params.startPrdDe = startPrdDe
    if (endPrdDe) params.endPrdDe = endPrdDe!
    if (newEstPrdCnt) params.newEstPrdCnt = newEstPrdCnt

    // 2) KOSIS 호출
    const rawRows = await fetchKosisData(params)

    // KOSIS가 에러 오브젝트를 줄 가능성 방지: 배열 보장 검사
    if (!Array.isArray(rawRows)) {
      // err/errMsg 형태면 그대로 노출
      const errMsg = toErrMessage(rawRows)
      return NextResponse.json(
        { ok: false, error: `KOSIS returned non-array: ${errMsg}`, params },
        { status: 502 }
      )
    }

    if (rawRows.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0, note: 'no rows', params })
    }

    // 3) 정규화
    const rows = normalizeKosisRows(rawRows, { orgId, tblId, regionKey })

    // 4) dryRun(미리보기) 모드: DB 저장 없이 프리뷰
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        mode: 'dryRun',
        count: rows.length,
        rawCount: rawRows.length,
        rawPreview: rawRows.slice(0, 3),
        normalizedPreview: rows.slice(0, 3),
        params,
      })
    }

    // 5) Upsert
    const table = pickImportTable(dataset)
    const { error } = await supabaseAdmin
      .from(table)
      .upsert(
        rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
        {
          onConflict: 'org_id,tbl_id,prd_de,region_code,itm_id',
          ignoreDuplicates: false,
        }
      )

    if (error) throw error

    return NextResponse.json({ ok: true, inserted: rows.length, params })
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: toErrMessage(e),
      },
      { status: 500 }
    )
  }
}
