// src/lib/news/ingestNaver.ts
import crypto from 'node:crypto'
import * as cheerio from 'cheerio'

const NAVER_ENDPOINT = 'https://openapi.naver.com/v1/search/news.json'
const QUERY = '한화투자증권'
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

/**
 * 네이버 뉴스 수집 → 중복 제거 → Supabase 저장
 * 반환: { collected: 수집건, inserted: 저장(신규)건 }
 */
export async function ingestNaverNews(supabase: any) {
  // 1) 네이버 API
  const apiRes = await fetch(
    `${NAVER_ENDPOINT}?query=${encodeURIComponent(QUERY)}&display=${DISPLAY}&sort=${SORT}`,
    {
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID || '',
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET || '',
      },
      cache: 'no-store',
    }
  )
  if (!apiRes.ok) {
    const text = await apiRes.text().catch(() => '')
    throw new Error(`NAVER API: ${text || apiRes.statusText}`)
  }
  const json = await apiRes.json()
  const items: Array<{
    title: string
    originallink?: string
    link: string
    description?: string
    pubDate?: string
  }> = json.items || []

  // 2) 가공 + 본문 시도 + 중복필드
  type Row = {
    title: string
    title_hash: string
    publisher: string | null
    source_url: string
    published_at: string | null
    content?: string | null
  }

  const seen = new Set<string>()
  const rows: Row[] = []

  for (const it of items) {
    const title = normalizeTitle(it.title || '')
    if (!title) continue
    const title_hash = hashTitle(title)
    if (seen.has(title_hash)) continue
    seen.add(title_hash)

    const url = (it.originallink || it.link || '').trim()
    if (!url) continue

    let publisher: string | null = null
    try {
      publisher = new URL(url).hostname.replace(/^www\./, '')
    } catch {}

    const published_at = it.pubDate ? new Date(it.pubDate).toISOString() : null

    let content: string | null = await fetchArticleBody(url)
    if (!content && it.description) {
      content = it.description.replace(/<b>|<\/b>/g, '').trim()
    }

    rows.push({
      title,
      title_hash,
      publisher,
      source_url: url,
      published_at,
      content,
    })
  }

  // 3) Supabase 저장 (URL 기준 upsert)
  let inserted = 0
  // upsert를 쓰려면 news_articles 테이블에 unique(source_url) 제약이 있어야 합니다.
  for (const r of rows) {
    const { error, data } = await supabase
      .from('news_articles')
      .upsert(
        {
          title: r.title,
          content: r.content,
          publisher: r.publisher,
          source_url: r.source_url,
          published_at: r.published_at,
          title_hash: r.title_hash,
        },
        { onConflict: 'source_url' }
      )
      .select('id')

    if (!error && Array.isArray(data) && data.length > 0) {
      // upsert가 update로 처리돼도 row가 반환되므로,
      // 신규 건수만 세고 싶다면 conflict 시 DO NOTHING 전략을 택하시거나,
      // 먼저 존재여부를 체크한 뒤 insert만 하는 방식으로 바꾸세요.
      inserted++
    }
  }

  return { collected: rows.length, inserted }
}
