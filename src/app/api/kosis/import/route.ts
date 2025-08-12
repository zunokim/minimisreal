// src/app/api/kosis/import/route.ts/check
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchKosisData, normalizeKosisRows } from '@/lib/kosis'

export const dynamic = 'force-dynamic'

function pickImportTable(dataset: string) {
  if (dataset === 'hcsi') return 'kosis_hcsi'
  if (dataset === 'unsold') return 'kosis_unsold'
  throw new Error('dataset must be "hcsi" or "unsold"')
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
  const itmId = searchParams.get('itmId') // ALL 또는 개별 코드
  const regionKey = (searchParams.get('regionKey') as 'C1' | 'C2' | 'C3' | null) ?? 'C1'

  // 지역 objL* 파라미터(있는 것만 전달)
  const objParams: Record<string, string> = {}
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
    // 1) KOSIS 데이터 호출 (항상 배열로 반환됨)
    const params: Record<string, string> = { orgId, tblId, prdSe, format: 'json', ...objParams }
    if (itmId) params.itmId = itmId
    if (startPrdDe) params.startPrdDe = startPrdDe
    if (endPrdDe) params.endPrdDe = endPrdDe!
    if (newEstPrdCnt) params.newEstPrdCnt = newEstPrdCnt

    const rawRows = await fetchKosisData(params) // ← 이제 무조건 배열
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0, note: 'no rows' })
    }

    // 2) 정규화
    const rows = normalizeKosisRows(rawRows, { orgId, tblId, regionKey })

    // 3) DB upsert
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

    return NextResponse.json({ ok: true, inserted: rows.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
