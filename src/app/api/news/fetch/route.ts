// src/app/api/news/fetch/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ingestNaverNews } from '@/lib/news/ingestNaver'

export async function GET() {
  try {
    const result = await ingestNaverNews(supabaseAdmin)
    return NextResponse.json({ ok: true, via: 'manual', ...result })
  } catch (err) {
    console.error('[news fetch manual]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

