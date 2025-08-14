import crypto from 'node:crypto'
import * as cheerio from 'cheerio'
import type { SupabaseClient } from '@supabase/supabase-js'

const NAVER_ENDPOINT = 'https://openapi.naver.com/v1/search/news.json'
const BASE_QUERY = '한화투자증권'
const DISPLAY = 100
const SORT = 'date'
const USER_AGENT = 'miniMIS/NewsFetcher (+https://example.com)'

function normalizeTitle(title: string) {
  return (title || '')
    .replace(/<b>|<\/b>/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hashTitle(title: string) {
  return crypto.createHash('sha1').update(title).digest('hex')
}

async function fetchArticleBody(url: string) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT },
      redirect: 'follow',
      cache: 'no-store',
    })
    if (!res.ok) return null
    const html = await res.text()
    const $ = cheerio.load(html)

    const naverBody = $('#newsct_article, #dic_area').text().trim()
    if (naverBody.length > 120) return naverBody

    const paragraphs = $('p').map((_, el) => $(el).text().trim()).get()
    const longParas = paragraphs.filter(t => t.length > 50).slice(0, 10)
    const combined = longParas.join('\n')
    return combined.length > 80 ? combined : null
  } catch {
    return null
  }
}

type IngestResult = { collected: number; inserted: number }

type IngestOptions = {
  /** 며칠 전까지 수집할지(기본 3일) */
  days?: number
  /** 페이지네이션 최대 페이지 수(기본 3). DISPLAY=100 기준 최대 300건 */
  maxPages?: number
  /** 검색어(기본 '한화투자증권') */
  query?: string
}

/**
 * 네이버 뉴스에서 최신순으로 수집.
 * - 주어진 days 기간 내 기사만 upsert (source_url UNIQUE 가정)
 * - maxPages 만큼 페이징, since 보다 오래된 기사 나오면 조기중단
 */
export async function ingestNaverNews(
  supabase: SupabaseClient,
  opts: IngestOptions = {}
): Promise<IngestResult> {
  const days = opts.days ?? 3
  const maxPages = Math.max(1, opts.maxPages ?? 3)
  const query = (opts.query ?? BASE_QUERY).trim() || BASE_QUERY

  const since = new Date()
  since.setDate(since.getDate() - days)

  let collected = 0
  let inserted = 0
  let stop = false

  for (let page = 0; page < maxPages && !stop; page++) {
    const start = 1 + page * DISPLAY // 1, 101, 201, ...
    if (start > 1000) break // 네이버 API 한계

    const url =
      `${NAVER_ENDPOINT}?query=${encodeURIComponent(query)}&display=${DISPLAY}` +
      `&start=${start}&sort=${SORT}`

    const apiRes = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID || '',
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET || '',
      },
      cache: 'no-store',
    })
    if (!apiRes.ok) {
      const text = await apiRes.text().catch(() => '')
      throw new Error(`NAVER API: ${text || apiRes.statusText}`)
    }
    const json = (await apiRes.json()) as {
      items?: Array<{
        title: string
        originallink?: string
        link: string
        description?: string
        pubDate?: string
      }>
    }
    const items = json.items || []
    if (items.length === 0) break

    // 정규화 & 기간 필터
    const seen = new Set<string>()
    for (const it of items) {
      const title = normalizeTitle(it.title || '')
      if (!title) continue
      const title_hash = hashTitle(title)
      if (seen.has(title_hash)) continue
      seen.add(title_hash)

      const url = (it.originallink || it.link || '').trim()
      if (!url) continue

      const pubISO = it.pubDate ? new Date(it.pubDate).toISOString() : null
      const pubDate = pubISO ? new Date(pubISO) : null

      // 최신순이므로 기간보다 오래된 것이 나오기 시작하면 더 내려가지 않음
      if (pubDate && pubDate < since) {
        stop = true
        continue
      }

      let publisher: string | null = null
      try { publisher = new URL(url).hostname.replace(/^www\./, '') } catch {}

      let content: string | null = await fetchArticleBody(url)
      if (!content && it.description) {
        content = it.description.replace(/<b>|<\/b>/g, '').trim()
      }

      // DB 저장
      const { error } = await supabase
        .from('news_articles')
        .upsert(
          {
            title,
            content,
            publisher,
            source_url: url,
            published_at: pubISO,  // null 허용
            title_hash,
          },
          { onConflict: 'source_url' }
        )
        .select('id')

      collected++
      if (!error) inserted++
    }
  }

  return { collected, inserted }
}
