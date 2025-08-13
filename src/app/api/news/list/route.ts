// src/app/api/news/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

function makeSnippet(s?: string | null, max = 220) {
  if (!s) return ''
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  // 문장 끝(.,!?, · ) 근처에서 자르기
  const cut = t.slice(0, max)
  const lastPunct = Math.max(
    cut.lastIndexOf('.'), cut.lastIndexOf('!'),
    cut.lastIndexOf('?'), cut.lastIndexOf('·')
  )
  return (lastPunct > 120 ? cut.slice(0, lastPunct + 1) : cut) + ' …'
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || '3')

    const since = new Date()
    since.setDate(since.getDate() - days)

    // content 포함
    const { data, error } = await supabase
      .from('news_articles')
      .select('id, title, content, publisher, source_url, published_at, fetched_at')
      .gte('published_at', since.toISOString())
      .order('published_at', { ascending: false })
      .limit(800)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    // 서버에서 기본 중복 제거(같은 title+publisher)
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

    // 언론사 distinct
    const publishers = Array.from(
      new Set(list.map(r => (r.publisher || 'Unknown')))
    ).sort((a, b) => a.localeCompare(b))

    return NextResponse.json({ ok: true, list, publishers })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
