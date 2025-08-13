// src/app/api/kosis/meta/route.ts
import { NextResponse } from 'next/server'
import {
  fetchKosisTableMeta,
  fetchKosisParameters,
  normalizeParameterPayload,
} from '@/lib/kosis'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const orgId = (searchParams.get('orgId') ?? '').trim()
    const tblId = (searchParams.get('tblId') ?? '').trim()

    if (!orgId || !tblId) {
      return NextResponse.json({ ok: false, error: 'Missing orgId or tblId' }, { status: 400 })
    }

    // 1) 테이블 메타(여러 엔드포인트 시도, 실패해도 계속)
    const tbl = await fetchKosisTableMeta(orgId, tblId)

    // 2) 변수(파라미터) 메타(여러 엔드포인트 시도)
    const param = await fetchKosisParameters(orgId, tblId)

    // 3) 정규화(파라미터 페이로드가 있을 때만)
    let catalog = null as ReturnType<typeof normalizeParameterPayload> | null
    if (param.payload) {
      catalog = normalizeParameterPayload(param.payload)
    }

    return NextResponse.json({
      ok: true,
      orgId,
      tblId,
      tableMeta: tbl.meta ?? null,
      parameterCatalog: catalog,
      diagnostics: {
        tableMeta: tbl.diagnostics,   // 각 시도 엔드포인트, 상태코드, 응답 미리보기
        parameters: param.diagnostics,
        note: 'KOSIS에서 404가 발생하면 여기 진단을 확인하세요.',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
