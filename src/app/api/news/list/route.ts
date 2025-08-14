// src/app/api/news/list/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * KST(+09:00) 하루 범위를 그대로 문자열로 생성
 * 예) 2025-08-14 → 
 *   start = '2025-08-14T00:00:00+09:00'
 *   end   = '2025-08-15T00:00:00+09:00'
 */
function kstRangeStrings(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map((s) => Number(s))
  const start = new Date(y, m - 1, d, 0, 0, 0) // 로컬(서버) 타임존 기준 Date 객체
  const end = new Date(y, m - 1, d + 1, 0, 0, 0)

  // 날짜 부분은 dateStr 사용, +09:00 고정 문자열로 생성 (toISOString() 사용 금지)
  const fmt = (dt: Date) => {
    const yy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}T00:00:00+09:00`
  }

  return { startKST: fmt(start), endKST: fmt(end) }
}

// HTML 태그 제거 + 공백 정리
function stripHtml(html?: string | null) {
  if (!html) return ''
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function makeSnippet(content?: string | null, maxLen = 160) {
  const plain = stripHtml(content)
  if (plain.length <= maxLen) return plain
  return plain.slice(0, maxLen - 1) + '…'
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const daysParam = searchParams.get('days')
    const dateParam = searchParams.get('date') // YYYY-MM-DD

    // 기본 3일
    const days = (daysParam === '1' || daysParam === '3' || daysParam === '7')
      ? Number(daysParam)
      : 3

    // ─────────────────────
    // ① 특정 일자 모드 (KST 기준)
    // ─────────────────────
    if (dateParam) {
      const { startKST, endKST } = kstRangeStrings(dateParam)

      // published_at이 해당 KST 날짜 범위에 있거나,
      // published_at이 NULL이고 fetched_at이 범위에 있는 경우 포함 (OR)
      const orExpr = [
        `and(published_at.gte.${startKST},published_at.lt.${endKST})`,
        `and(published_at.is.null,fetched_at.gte.${startKST},fetched_at.lt.${endKST})`,
      ].join(',')

      const { data, error } = await supabaseAdmin
        .from('news_articles')
        .select('id,title,content,publisher,source_url,published_at,fetched_at', { count: 'exact' })
        .or(orExpr)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('fetched_at', { ascending: false })
        .limit(1000)

      if (error) throw error

      const list = (data ?? []).map((r) => ({
        ...r,
        snippet: makeSnippet(r.content),
      }))

      const publishers = Array.from(
        new Set(list.map((r) => r.publisher || 'Unknown'))
      ).sort((a, b) => a.localeCompare(b, 'ko'))

      return NextResponse.json({ ok: true, list, publishers })
    }

    // ─────────────────────
    // ② 최근 N일 모드 (단순 fetched_at 기준)
    //    * UI의 1/3/7일은 목록 필터용이므로 여기서는 UTC 기준 단순 범위여도 충분
    // ─────────────────────
    const now = new Date()
    const from = new Date(now)
    from.setDate(from.getDate() - days)

    const { data, error } = await supabaseAdmin
      .from('news_articles')
      .select('id,title,content,publisher,source_url,published_at,fetched_at', { count: 'exact' })
      .gte('fetched_at', from.toISOString())
      .lt('fetched_at', now.toISOString())
      .order('fetched_at', { ascending: false })
      .limit(1000)

    if (error) throw error

    const list = (data ?? []).map((r) => ({
      ...r,
      snippet: makeSnippet(r.content),
    }))

    const publishers = Array.from(
      new Set(list.map((r) => r.publisher || 'Unknown'))
    ).sort((a, b) => a.localeCompare(b, 'ko'))

    return NextResponse.json({ ok: true, list, publishers })
  } catch (err) {
    console.error('[api/news/list]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
