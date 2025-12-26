// src/app/api/cron/daily-briefing/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 네이버 검색 (정확도순, 20건만)
async function fetchTopNews(keyword: string) {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  // sort=sim (정확도순)으로 검색 -> 오늘의 핫한 뉴스 위주
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=20&sort=sim`
  
  const res = await fetch(url, { headers: { 'X-Naver-Client-Id': clientId!, 'X-Naver-Client-Secret': clientSecret! } })
  const data = await res.json()
  return data.items || []
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. 브리핑할 대상 키워드 (한화투자증권, 한화증권)
    // DB에 있는 모든 키워드를 할지, 특정 키워드만 할지 결정. 여기선 하드코딩 예시.
    const targetKeywords = ['한화투자증권', '한화증권']

    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    if (subscriberIds.length === 0) return NextResponse.json({ message: 'No subscribers' })
    
    const token = process.env.TELEGRAM_BOT_TOKEN
    const today = new Date().toDateString() // "Fri Dec 26 2025" 형식

    for (const keyword of targetKeywords) {
      const items = await fetchTopNews(keyword)
      
      // 2. '오늘' 작성된 기사만 필터링
      const todayItems = items.filter((item: any) => {
        const pDate = new Date(item.pubDate)
        return pDate.toDateString() === today
      })

      // 3. Top 5 선정
      const top5 = todayItems.slice(0, 5)

      if (top5.length > 0) {
        let message = `🌅 <b>[오늘의 ${keyword} Top 5]</b>\n`
        message += `(기준: ${new Date().toLocaleDateString()})\n\n`

        top5.forEach((item: any, idx: number) => {
          const title = escapeHtml(item.title.replace(/<[^>]*>?/gm, ''))
          message += `${idx + 1}. <a href="${item.link}">${title}</a>\n\n`
        })

        // 전송
        await Promise.all(subscriberIds.map(id => 
           fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ chat_id: id, text: message, parse_mode: 'HTML', disable_web_page_preview: true })
           })
        ))
      }
    }

    return NextResponse.json({ success: true, message: 'Briefing Sent' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}