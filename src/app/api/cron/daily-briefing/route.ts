// src/app/api/cron/daily-briefing/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// KST 날짜 문자열 변환 (예: 2025-12-26)
function getKSTDateString(date: Date) {
  const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  return kstDate.toISOString().split('T')[0];
}

async function fetchTopNews(keyword: string) {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  
  // [수정] display를 100으로 늘려서 더 깊게 찾음
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=100&sort=sim`
  
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

    const targetKeywords = ['한화투자증권', '한화증권']
    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    if (subscriberIds.length === 0) return NextResponse.json({ message: 'No subscribers' })
    
    const token = process.env.TELEGRAM_BOT_TOKEN
    const todayKST = getKSTDateString(new Date());

    const debugInfo: any[] = [] // 결과 확인용 로그 바구니

    for (const keyword of targetKeywords) {
      const items = await fetchTopNews(keyword)
      
      // 날짜 필터링
      const todayItems = items.filter((item: any) => {
        const itemDate = new Date(item.pubDate);
        const itemDateKST = getKSTDateString(itemDate);
        return itemDateKST === todayKST;
      })

      // 로그 기록 (이걸 봐야 왜 안 갔는지 알 수 있음)
      debugInfo.push({
        keyword,
        total_fetched: items.length,     // 네이버에서 가져온 개수
        today_matched: todayItems.length, // 그중 오늘 날짜 개수
        top_item_date: items[0] ? items[0].pubDate : 'None' // 1등 기사의 날짜 확인
      })

      const top5 = todayItems.slice(0, 5)

      if (top5.length > 0) {
        let message = `🌅 <b>[오늘의 ${keyword} Top 5]</b>\n`
        message += `(기준: ${todayKST})\n\n`

        top5.forEach((item: any, idx: number) => {
          const title = escapeHtml(item.title.replace(/<[^>]*>?/gm, ''))
          message += `${idx + 1}. <a href="${item.link}">${title}</a>\n\n`
        })

        await Promise.all(subscriberIds.map(id => 
           fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ chat_id: id, text: message, parse_mode: 'HTML', disable_web_page_preview: true })
           })
        ))
      }
    }

    // 결과 JSON에 debugInfo를 포함해서 리턴
    return NextResponse.json({ 
      success: true, 
      date_kst: todayKST,
      debug_logs: debugInfo 
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}