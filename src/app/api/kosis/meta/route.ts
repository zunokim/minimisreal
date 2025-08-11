// src/app/api/kosis/meta/route.ts
import { NextResponse } from 'next/server'
import { fetchKosisMeta } from '@/lib/kosis'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const orgId = searchParams.get('orgId')
  const tblId = searchParams.get('tblId')
  const type = (searchParams.get('type') as 'TBL' | 'ITM' | 'OBJ' | null) ?? 'TBL'

  if (!orgId || !tblId) {
    return NextResponse.json(
      { ok: false, error: 'Missing orgId or tblId. 예: /api/kosis/meta?orgId=390&tblId=DT_...' },
      { status: 400 }
    )
  }

  try {
    const data = await fetchKosisMeta({ orgId, tblId, type })
    return NextResponse.json({ ok: true, data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
