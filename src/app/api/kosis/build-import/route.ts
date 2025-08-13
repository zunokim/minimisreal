// src/app/api/kosis/build-import/route.ts
import { NextResponse } from 'next/server'
import {
  fetchKosisParameters,
  normalizeParameterPayload,
  type ParamCatalog,
} from '@/lib/kosis'

export const dynamic = 'force-dynamic'

/**
 * 한글 라벨(예: '민간부문', '전국')로 KOSIS 변수 ID들을 찾아
 * /api/kosis/import 호출용 최종 URL을 만들어 주는 보조 엔드포인트입니다.
 *
 * 사용 예:
 *   GET /api/kosis/build-import
 *     ?dataset=unsold_after
 *     &orgId=116
 *     &tblId=DT_MLTM_5328
 *     &prdSe=M
 *     &startPrdDe=202401
 *     &endPrdDe=202507
 *     &regionKey=C2
 *     &itmName=합계           ← ITM 항목 라벨(옵션)
 *     &objL1Name=민간부문     ← OBJL1 라벨(옵션)
 *     &objL2Name=전국         ← 필요 시 다른 축 라벨(옵션, 없으면 ALL)
 *     &objL3Name=...          ← 필요 시 (옵션)
 *     &dryRun=1               ← 미리보기(옵션)
 *
 * 응답:
 *  - resolved: 실제 찾은 코드들
 *  - importUrl: /api/kosis/import 로 바로 호출 가능한 URL
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const dataset = (url.searchParams.get('dataset') ?? '').trim()
    const orgId = (url.searchParams.get('orgId') ?? '').trim()
    const tblId = (url.searchParams.get('tblId') ?? '').trim()
    const prdSe = (url.searchParams.get('prdSe') ?? 'M').trim().toUpperCase()
    const startPrdDe = (url.searchParams.get('startPrdDe') ?? '').trim()
    const endPrdDe = (url.searchParams.get('endPrdDe') ?? '').trim()
    const regionKey = (url.searchParams.get('regionKey') ?? 'C2').trim()
    const dryRun = (url.searchParams.get('dryRun') ?? '').trim()

    // 라벨 입력(옵션)
    const itmName = (url.searchParams.get('itmName') ?? '').trim()
    const objL1Name = (url.searchParams.get('objL1Name') ?? '').trim()
    const objL2Name = (url.searchParams.get('objL2Name') ?? '').trim()
    const objL3Name = (url.searchParams.get('objL3Name') ?? '').trim()

    if (!dataset || !orgId || !tblId) {
      return NextResponse.json(
        { ok: false, error: 'Missing dataset, orgId or tblId' },
        { status: 400 }
      )
    }

    // 1) 변수(파라미터) 메타 조회
    const paramRaw = await fetchKosisParameters(orgId, tblId)
    const catalog = normalizeParameterPayload(paramRaw) as ParamCatalog

    // 2) 라벨로 ID 찾기 헬퍼
    function findIdByName(list: Array<{ id: string; name: string }> | undefined, q: string) {
      if (!list || !q) return undefined
      // 완전일치 우선, 그다음 포함 매칭
      const exact = list.find((x) => x.name === q)
      if (exact) return exact.id
      const icase = q.toLowerCase()
      const contains = list.find((x) => x.name.toLowerCase().includes(icase))
      return contains?.id
    }

    // 3) 항목/분류 라벨 → 코드 해석
    const resolvedItmId = findIdByName(catalog.itm, itmName) ?? 'ALL'
    const resolvedObjL1 =
      findIdByName(catalog.obj?.objL1, objL1Name) ??
      // 일부 표에서 '전국' 같은 라벨이 objL1에 있을 수 있어 보조 매칭
      (objL1Name ? 'ALL' : 'ALL')
    const resolvedObjL2 = findIdByName(catalog.obj?.objL2, objL2Name) ?? 'ALL'
    const resolvedObjL3 = findIdByName(catalog.obj?.objL3, objL3Name) ?? 'ALL'

    // 참고: '전국'은 보통 지역(C1/C2) 축으로 내려오며, 본 Import API는 지역 코드를 개별 지정하지 않고
    // 전체 지역을 불러온 뒤 DB에 저장합니다. 조회 화면에서 '전국'만 필터링하여 보시는 방식이 일반적입니다.
    // (만약 API 단계에서 특정 지역 코드만 받도록 바꾸고 싶으시면, fetchKosisData에 C1/C2 파라미터 전달을 추가해야 합니다.)

    // 4) 최종 Import URL 구성
    const base = new URL('/api/kosis/import', url.origin)
    base.searchParams.set('dataset', dataset)
    base.searchParams.set('orgId', orgId)
    base.searchParams.set('tblId', tblId)
    base.searchParams.set('prdSe', prdSe)
    if (startPrdDe) base.searchParams.set('startPrdDe', startPrdDe)
    if (endPrdDe) base.searchParams.set('endPrdDe', endPrdDe)
    base.searchParams.set('regionKey', regionKey)
    base.searchParams.set('itmId', resolvedItmId)
    base.searchParams.set('objL1', resolvedObjL1)
    base.searchParams.set('objL2', resolvedObjL2)
    base.searchParams.set('objL3', resolvedObjL3)
    if (dryRun) base.searchParams.set('dryRun', dryRun)

    return NextResponse.json({
      ok: true,
      note:
        'importUrl을 복사해 호출하거나, parameters.raw에서 상세 원본 메타를 확인해 정확한 라벨을 선택하세요.',
      resolved: {
        itmId: { label: itmName || '(생략→ALL)', value: resolvedItmId },
        objL1: { label: objL1Name || '(생략→ALL)', value: resolvedObjL1 },
        objL2: { label: objL2Name || '(생략→ALL)', value: resolvedObjL2 },
        objL3: { label: objL3Name || '(생략→ALL)', value: resolvedObjL3 },
      },
      importUrl: base.toString(),
      // 디버그/참고용 요약
      available: {
        itmCount: catalog.itm?.length ?? 0,
        objL1Count: catalog.obj?.objL1?.length ?? 0,
        objL2Count: catalog.obj?.objL2?.length ?? 0,
        objL3Count: catalog.obj?.objL3?.length ?? 0,
      },
      // 필요 시 원본까지 내려드립니다(용량 주의)
      // parametersRaw: catalog.raw,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
