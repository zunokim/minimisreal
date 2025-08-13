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

export const dynamic = 'force-dynamic' // 캐시 방지 (선택)
