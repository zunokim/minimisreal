/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/kosis/build-import/route.ts
import { NextResponse } from 'next/server'
import { normalizeParameterPayload } from '@/lib/kosis'

export const dynamic = 'force-dynamic'

/**
 * 보조 라우트: UI에서 orgId/tblId/선택값을 받아 내부 /api/kosis/import 호출 URL을 만들어주는 유틸.
 * (필요 시 확장해서 사용하세요)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const origin = url.origin
    const dataset = (url.searchParams.get('dataset') ?? '').trim()
    const orgId = (url.searchParams.get('orgId') ?? '').trim()
    const tblId = (url.searchParams.get('tblId') ?? '').trim()
    const prdSe = (url.searchParams.get('prdSe') ?? 'M').trim().toUpperCase()
    const startPrdDe = (url.searchParams.get('startPrdDe') ?? '').trim()
    const endPrdDe = (url.searchParams.get('endPrdDe') ?? '').trim()
    const regionKey = (url.searchParams.get('regionKey') ?? '').trim()
    const dryRun = url.searchParams.get('dryRun') ?? ''

    if (!dataset || !orgId || !tblId || !startPrdDe || !endPrdDe) {
      return NextResponse.json({ ok: false, error: 'Missing required params' }, { status: 400 })
    }

    const importUrl = new URL('/api/kosis/import', origin)
    importUrl.searchParams.set('dataset', dataset)
    importUrl.searchParams.set('orgId', orgId)
    importUrl.searchParams.set('tblId', tblId)
    importUrl.searchParams.set('prdSe', prdSe)
    importUrl.searchParams.set('startPrdDe', startPrdDe)
    importUrl.searchParams.set('endPrdDe', endPrdDe)
    if (regionKey) importUrl.searchParams.set('regionKey', regionKey)
    if (dryRun) importUrl.searchParams.set('dryRun', dryRun)

    // 선택 파라미터들은 그대로 전달
    ;['itmId','objL','objL1','objL2','objL3','objL4','objL5','objL6','objL7','objL8','newEstPrdCnt']
      .forEach((k) => {
        const v = url.searchParams.get(k)
        if (v) importUrl.searchParams.set(k, v)
      })

    return NextResponse.json({ ok: true, url: importUrl.toString() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
