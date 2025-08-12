// src/app/api/kosis/meta/route.ts
import { NextResponse } from 'next/server'
import { fetchKosisMeta } from '@/lib/kosis'

export const dynamic = 'force-dynamic'

function toErrMessage(e: unknown) {
  if (e instanceof Error) return e.message
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const orgId = searchParams.get('orgId')
  const tblId = searchParams.get('tblId')
  const type = searchParams.get('type') ?? undefined // 'TBL' | 'OBJ' | 'ITM' 등

  if (!orgId || !tblId) {
    return NextResponse.json(
      { ok: false, error: '필수: orgId, tblId' },
      { status: 400 }
    )
  }

  try {
    const data = await fetchKosisMeta({ orgId, tblId, type })
    // fetchKosisMeta 내부에서 비표준 JSON도 파싱해 반환합니다.
    return NextResponse.json({ ok: true, data })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: toErrMessage(e) },
      { status: 502 }
    )
  }
}
