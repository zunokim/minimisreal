/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/kosis/meta/route.ts
import { NextResponse } from 'next/server'
import { fetchKosisTableMeta, fetchKosisParameters, normalizeParameterPayload } from '@/lib/kosis'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const orgId = (searchParams.get('orgId') ?? '').trim()
    const tblId = (searchParams.get('tblId') ?? '').trim()

    if (!orgId || !tblId) {
      return NextResponse.json({ ok: false, error: 'Missing orgId or tblId' }, { status: 400 })
    }

    const meta = await fetchKosisTableMeta(orgId, tblId)
    const params = await fetchKosisParameters(orgId, tblId)

    const parameterCatalog = normalizeParameterPayload(params.payload)

    return NextResponse.json({
      ok: true,
      orgId,
      tblId,
      tableMeta: meta.meta,
      parameterCatalog,
      diagnostics: {
        tableMeta: meta.diagnostics,
        parameters: params.diagnostics,
        note: 'KOSIS에서 404가 발생하면 여기 진단을 확인하세요.',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
