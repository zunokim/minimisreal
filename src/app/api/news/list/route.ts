// src/app/api/news/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin  } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function makeSnippet(s?: string | null, max = 220) {
  if (!s) return ''
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const lastPunct = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'), cut.lastIndexOf('·'))
  return (lastPunct > 120 ? cut.slice(0, lastPunct + 1) : cut) + ' …'
}

function toErrorMessage(e: unknown) {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try { return JSON.stringify(e) } catch { return 'Unknown error' }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || '3')

    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data, error } = await supabaseAdmin
      .from('news_articles')
      .select('id, title, content, publisher, source_url, published_at, fetched_at')
      .or(`published_at.gte.${since.toISOString()},published_at.is.null`) // ← 발행일이 null인 기사도 임시 포함
      .order('published_at', { ascending: false })
      .limit(800)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const seen = new Set<string>()
    const list = (data || []).filter((row) => {
      const key = (row.title || '') + '|' + (row.publisher || '')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).map(row => ({
      ...row,
      snippet: makeSnippet(row.content),
    }))

    const publishers = Array.from(new Set(list.map(r => (r.publisher || 'Unknown'))))
      .sort((a, b) => a.localeCompare(b))

    return NextResponse.json({ ok: true, list, publishers })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: toErrorMessage(e) }, { status: 500 })
  }
}
