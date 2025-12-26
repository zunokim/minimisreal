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

async function fetchTodayNews(keyword: string) {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  
  // [핵심 변경] sort=date (최신순)으로 변경하여 오늘 기사를 확실하게 잡음
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=50&sort=date`
  
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
    const todayKST = getKSTDateString(new Date()); // 한국 시간 기준 오늘

    let sentCount = 0;

    for (const keyword of targetKeywords) {
      const items = await fetchTodayNews(keyword)
      
      // '오늘(KST)' 작성된 기사만 필터링
      const todayItems = items.filter((item: any) => {
        const itemDate = new Date(item.pubDate);
        const itemDateKST = getKSTDateString(itemDate);
        return itemDateKST === todayKST;
      })

      // 최신순 5개 (sort=date로 가져왔으므로 자동 정렬되어 있음)
      const top5 = todayItems.slice(0, 5)

      if (top5.length > 0) {
        let message = `🌅 <b>[오늘의 ${keyword} 브리핑]</b>\n`
        message += `(기준: ${todayKST})\n\n`

        top5.forEach((item: any, idx: number) => {
          const title = escapeHtml(item.title.replace(/<[^>]*>?/gm, ''))
          // 시간 표시 (HH:MM)
          const timeStr = new Date(item.pubDate).toLocaleTimeString('ko-KR', {hour: '2-digit', minute:'2-digit'});
          
          message += `${idx + 1}. <a href="${item.link}">${title}</a>\n`
          message += `   <i style="color:#888">(${timeStr})</i>\n\n`
        })

        await Promise.all(subscriberIds.map(id => 
           fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ chat_id: id, text: message, parse_mode: 'HTML', disable_web_page_preview: true })
           })
        ))
        sentCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      date_kst: todayKST,
      message: sentCount > 0 ? `Sent briefing for ${sentCount} keywords` : 'No news found today'
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}