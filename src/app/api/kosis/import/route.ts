// src/app/api/kosis/import/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchKosisData, normalizeKosisRows } from '@/lib/kosis'

function pickImportTable(dataset: string) {
  if (dataset === 'hcsi') return 'kosis_hcsi'
  if (dataset === 'unsold') return 'kosis_unsold'
  throw new Error('dataset must be "hcsi" or "unsold"')
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const dataset = searchParams.get('dataset')
  const orgId = searchParams.get('orgId')
  const tblId = searchParams.get('tblId')
  const prdSe = searchParams.get('prdSe') // M/Q/Y
  const startPrdDe = searchParams.get('startPrdDe')
  const endPrdDe = searchParams.get('endPrdDe')
  const newEstPrdCnt = searchParams.get('newEstPrdCnt') // 최신 n건
  const itmId = searchParams.get('itmId') // ALL 또는 코드
  const objL1 = searchParams.get('objL1') // 지역코드 레벨1 (표에 따라 L2,L3 사용 가능)

  if (!dataset || !orgId || !tblId || !prdSe) {
    return NextResponse.json(
      { error: '필수: dataset, orgId, tblId, prdSe' },
      { status: 400 }
    )
  }
  if (!startPrdDe && !newEstPrdCnt) {
    return NextResponse.json(
      { error: '기간 지정 필요: startPrdDe/endPrdDe 또는 newEstPrdCnt' },
      { status: 400 }
    )
  }

  try {
    // 1) KOSIS 호출
    const params: Record<string, string> = {
      orgId,
      tblId,
      prdSe,
      format: 'json'
    }
    if (itmId) params.itmId = itmId
    if (objL1) params.objL1 = objL1
    if (startPrdDe) params.startPrdDe = startPrdDe
    if (endPrdDe) params.endPrdDe = endPrdDe!
    if (newEstPrdCnt) params.newEstPrdCnt = newEstPrdCnt

    const raw = await fetchKosisData(params)

    // 2) 정규화
    const rows = normalizeKosisRows(raw, {
      orgId,
      tblId,
      regionKey: 'C1' // 표에 따라 C2/C3가 지역일 수 있음(메타 보고 조정)
    })

    // 3) DB 업서트
    const table = pickImportTable(dataset)
    // upsert: 고유키(org_id, tbl_id, prd_de, region_code, itm_id)
    const { error } = await supabaseAdmin
      .from(table)
      .upsert(
        rows.map((r) => ({
          ...r,
          updated_at: new Date().toISOString()
        })),
        {
          onConflict: 'org_id,tbl_id,prd_de,region_code,itm_id',
          ignoreDuplicates: false
        }
      )
    if (error) throw error

    return NextResponse.json({ ok: true, inserted: rows.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
