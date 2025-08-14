// src/app/api/news/fetch-a93fks1x9p/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
