/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/kosis/probe/route.ts
import { NextResponse } from 'next/server'
import { fetchKosisData } from '@/lib/kosis'

export const dynamic = 'force-dynamic'

/**
 * 간단 프로브: 넘겨준 파라미터로 실제 KOSIS 호출 테스트
 * 예)
 * /api/kosis/probe?orgId=116&tblId=DT_MLTM_5328&prdSe=M&itmId=13103871088T1&objL1=13102871088A.0001&startPrdDe=202506&endPrdDe=202506
 */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    const orgId = (u.searchParams.get('orgId') ?? '').trim()
    const tblId = (u.searchParams.get('tblId') ?? '').trim()
    const prdSe = (u.searchParams.get('prdSe') ?? 'M').trim().toUpperCase() as any
    const startPrdDe = u.searchParams.get('startPrdDe') ?? undefined
    const endPrdDe = u.searchParams.get('endPrdDe') ?? undefined

    const p: Record<string, string | undefined> = {}
    ;['itmId','objL','objL1','objL2','objL3','objL4','objL5','objL6','objL7','objL8','newEstPrdCnt']
      .forEach((k) => { const v = u.searchParams.get(k); if (v) p[k] = v })

    if (!orgId || !tblId) {
      return NextResponse.json({ ok: false, error: 'Missing orgId or tblId' }, { status: 400 })
    }

    const rows = await fetchKosisData({
      orgId, tblId, prdSe: (['Y','H','Q','M','D','IR','F','S'].includes(prdSe) ? prdSe : 'M') as any,
      startPrdDe, endPrdDe,
      ...p,
      format: 'json',
    })

    return NextResponse.json({
      ok: true,
      count: Array.isArray(rows) ? rows.length : 0,
      preview: (rows ?? []).slice(0, 3),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
