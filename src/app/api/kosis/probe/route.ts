// src/app/api/kosis/probe/route.ts
import { NextResponse } from 'next/server'
import { fetchKosisData } from '@/lib/kosis'

export const dynamic = 'force-dynamic'

/**
 * KOSIS 데이터 API가 요구하는 objL* 조합을 자동으로 탐색합니다.
 * - orgId, tblId, prdSe는 필수
 * - startPrdDe, endPrdDe는 선택
 * - regionKey는 참고용으로만 되돌려줍니다(실제 조회에는 쓰지 않음)
 *
 * 예:
 * /api/kosis/probe?orgId=116&tblId=DT_MLTM_5328&prdSe=M&startPrdDe=202401&endPrdDe=202507
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const orgId = (url.searchParams.get('orgId') ?? '').trim()
    const tblId = (url.searchParams.get('tblId') ?? '').trim()
    const prdSe = ((url.searchParams.get('prdSe') ?? 'M').trim().toUpperCase()) as
      | 'Y' | 'H' | 'Q' | 'M' | 'D' | 'IR' | 'F' | 'S'
    const startPrdDe = url.searchParams.get('startPrdDe') ?? undefined
    const endPrdDe = url.searchParams.get('endPrdDe') ?? undefined

    if (!orgId || !tblId) {
      return NextResponse.json({ ok: false, error: 'Missing orgId or tblId' }, { status: 400 })
    }

    // 시도 순서:
    // 1) itmId=ALL + objL1만 ALL
    // 2) itmId=ALL + objL1/objL2 ALL
    // 3) itmId=ALL + objL1/objL2/objL3 ALL
    // 4) itmId=ALL + objL1/objL2/objL3/objL4 ALL
    // (표에 따라 objL2 이상이 없을 수도 있습니다)
    const combos = [
      { objL1: 'ALL' },
      { objL1: 'ALL', objL2: 'ALL' },
      { objL1: 'ALL', objL2: 'ALL', objL3: 'ALL' },
      { objL1: 'ALL', objL2: 'ALL', objL3: 'ALL', objL4: 'ALL' },
    ] as Array<Record<string, string>>

    const attempts: Array<{ params: any; ok: boolean; error?: string; sample?: any[] }> = []

    for (const c of combos) {
      try {
        const rows = await fetchKosisData({
          orgId,
          tblId,
          prdSe,
          startPrdDe,
          endPrdDe,
          itmId: 'ALL',
          ...(c as any),
          format: 'json',
        })
        if (Array.isArray(rows) && rows.length > 0) {
          // 성공 → 샘플 5건만 미리보기(원본 키 그대로 반환해 어떤 C1/C2/ITM이 있는지 확인)
          attempts.push({
            params: { itmId: 'ALL', ...c },
            ok: true,
            sample: rows.slice(0, 5),
          })
          return NextResponse.json({
            ok: true,
            note: '아래의 params로 /api/kosis/import에 적용하면 수집이 성공합니다.',
            resolvedParams: { itmId: 'ALL', ...c },
            attempts,
          })
        } else {
          attempts.push({
            params: { itmId: 'ALL', ...c },
            ok: true,
            sample: [],
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        attempts.push({ params: { itmId: 'ALL', ...c }, ok: false, error: msg })
        // "필수요청변수값 누락되었습니다. (objL2)" 같은 메시지면 다음 조합으로 진행
      }
    }

    return NextResponse.json({
      ok: false,
      error: 'All probes failed or returned empty.',
      attempts,
    }, { status: 502 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
