export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ingestNaverNews } from '@/lib/news/ingestNaver'

export async function GET(req: NextRequest) {
  // ✅ 선택: 간단한 보호 (쿼리스트링 ?key=... 와 환경변수 비교)
  const secret = process.env.BACKFILL_SECRET
  const key = new URL(req.url).searchParams.get('key')
  if (secret && key !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const result = await ingestNaverNews(supabaseAdmin, {
      days: 7,        // ← 이번 한 번만 7일치
      maxPages: 10,   // ← 필요 시 더 늘려도 됩니다(최대 start<=1000 제한)
    })
    return NextResponse.json({ ok: true, via: 'backfill-7d', ...result })
  } catch (err) {
    console.error('[news backfill 7d]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
