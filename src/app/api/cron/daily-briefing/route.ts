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

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. 브리핑 대상 키워드
    const targetKeywords = ['한화투자증권', '한화증권']

    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    if (subscriberIds.length === 0) return NextResponse.json({ message: 'No subscribers' })
    
    const token = process.env.TELEGRAM_BOT_TOKEN
    const todayKST = getKSTDateString(new Date());

    // [중요] 내 웹사이트 주소 (환경변수로 설정하거나 여기에 하드코딩)
    // 예: https://my-news-app.vercel.app
    const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://minimisreal.vercel.app'

    let sentCount = 0;

    for (const keyword of targetKeywords) {
      // 2. DB에서 '오늘' 수집된 해당 키워드 뉴스 개수 조회
      // (5분마다 도는 봇이 열심히 DB에 쌓아놨다고 가정)
      
      const startDate = `${todayKST}T00:00:00`
      const endDate = `${todayKST}T23:59:59`

      const { count, error } = await supabase
        .from('news_articles')
        .select('*', { count: 'exact', head: true }) // 데이터 안 가져오고 개수만 셈
        .ilike('title', `%${keyword}%`)
        .gte('published_at', startDate)
        .lte('published_at', endDate)
      
      const newsCount = count || 0;

      // 뉴스가 1개라도 있으면 발송
      if (newsCount > 0) {
        // 랜딩 페이지 URL 생성
        // 예: https://.../news/daily-summary?keyword=한화투자증권&date=2025-12-26
        const linkUrl = `${BASE_URL}/news/daily-summary?keyword=${encodeURIComponent(keyword)}&date=${todayKST}`

        const message = `🌅 <b>[오늘의 ${keyword} 뉴스 브리핑]</b>\n\n`
          + `📅 기준: ${todayKST}\n`
          + `📊 수집된 뉴스: <b>총 ${newsCount}건</b>\n\n`
          + `👇 아래 링크를 눌러 전체 뉴스를 확인하세요.\n` 
          + `<a href="${linkUrl}">🔗 전체 뉴스 보러가기</a>`

        await Promise.all(subscriberIds.map(id => 
           fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ 
               chat_id: id, 
               text: message, 
               parse_mode: 'HTML',
               // 링크 미리보기 켜서 버튼처럼 보이게 할 수도 있음 (취향 차이)
               disable_web_page_preview: false 
             })
           })
        ))
        sentCount++;
      }
    }

    return NextResponse.json({ success: true, sent_keywords: sentCount })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}