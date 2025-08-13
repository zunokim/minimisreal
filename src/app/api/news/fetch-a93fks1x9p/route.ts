// src/app/api/news/fetch-a93fks1x9p/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ingestNaverNews } from '@/lib/news/ingestNaver'

export async function GET() {
  try {
    const result = await ingestNaverNews(supabaseAdmin)
    return NextResponse.json({ ok: true, via: 'cron', ...result })
  } catch (err) {
    console.error('[news fetch cron]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}


// Node.js 런타임 강제
export const runtime = 'nodejs'
// (선택) 캐시/프리렌더 방지
export const dynamic = 'force-dynamic'
