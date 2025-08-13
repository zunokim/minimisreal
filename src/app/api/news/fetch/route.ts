// src/app/api/news/fetch/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { ingestNaverNews } from '@/lib/news/ingestNaver'

export async function GET() {
  try {
    const result = await ingestNaverNews(supabase)
    return NextResponse.json({ ok: true, via: 'manual', ...result })
  } catch (err) {
    console.error('[news fetch manual]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// Node.js 런타임 강제
export const runtime = 'nodejs'
// (선택) 캐시/프리렌더 방지
export const dynamic = 'force-dynamic'
