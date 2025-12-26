// src/app/api/cron/daily-briefing/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 한국 시간(KST) 기준 날짜 문자열(YYYY-MM-DD) 반환 함수
function getKSTDateString(date: Date) {
  // UTC 시간에 9시간을 더함
  const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  // ISOString은 UTC 기준이므로, 잘라서 사용 (YYYY-MM-DD)
  return kstDate.toISOString().split('T')[0];
}

// 네이버 검색 (정확도순, 30건 정도 넉넉히 가져옴)
async function fetchTopNews(keyword: string) {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  
  // sort=sim (정확도순)으로 해야 '주요 뉴스'가 잡힘
  // 넉넉하게 30개를 가져와서 날짜로 필터링
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=30&sort=sim`
  
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

    // 1. 브리핑할 대상 키워드
    const targetKeywords = ['한화투자증권', '한화증권']

    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    if (subscriberIds.length === 0) return NextResponse.json({ message: 'No subscribers' })
    
    const token = process.env.TELEGRAM_BOT_TOKEN
    
    // [중요] 한국 시간 기준 '오늘' 날짜 구하기 (예: "2025-12-26")
    const todayKST = getKSTDateString(new Date());

    console.log(`[Daily Briefing] Start - Target Date(KST): ${todayKST}`); // 로그 확인용

    let totalSent = 0;

    for (const keyword of targetKeywords) {
      const items = await fetchTopNews(keyword)
      
      // 2. '오늘(KST)' 작성된 기사만 필터링
      const todayItems = items.filter((item: any) => {
        const itemDate = new Date(item.pubDate);
        const itemDateKST = getKSTDateString(itemDate);
        return itemDateKST === todayKST;
      })

      console.log(`[${keyword}] Found: ${items.length}, Today(KST): ${todayItems.length}`); // 로그 확인용

      // 3. Top 5 선정
      const top5 = todayItems.slice(0, 5)

      if (top5.length > 0) {
        let message = `🌅 <b>[오늘의 ${keyword} Top 5]</b>\n`
        message += `(기준: ${todayKST})\n\n`

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
        totalSent++;
      }
    }

    return NextResponse.json({ success: true, message: `Briefing Sent for ${totalSent} keywords`, date: todayKST })
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}