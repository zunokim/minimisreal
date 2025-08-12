// src/app/api/kosis/meta/route.ts
import { NextResponse } from 'next/server'
import { fetchKosisTableMeta } from '@/lib/kosis'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get('orgId') ?? ''
    const tblId = searchParams.get('tblId') ?? ''

    if (!orgId || !tblId) {
      return NextResponse.json({ ok: false, error: 'Missing orgId or tblId' }, { status: 400 })
    }

    const data = await fetchKosisTableMeta(orgId, tblId)
    return NextResponse.json({ ok: true, data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
