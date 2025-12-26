// src/app/api/cron/daily-briefing/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// KST 날짜 (YYYY-MM-DD) 구하기
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

    const targetKeywords = ['한화투자증권', '한화증권'] // 묶어서 처리하고 싶으시면 로직 수정 가능
    
    // 구독자 가져오기
    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    if (subscriberIds.length === 0) return NextResponse.json({ message: 'No subscribers' })
    
    const token = process.env.TELEGRAM_BOT_TOKEN
    const todayKST = getKSTDateString(new Date());
    
    // 배포된 사이트 주소
    const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    let sentCount = 0;
    
    // 오늘 범위 (00:00:00 ~ 23:59:59)
    const startDate = `${todayKST}T00:00:00`
    const endDate = `${todayKST}T23:59:59`

    for (const keyword of targetKeywords) {
      // DB에서 오늘 fetched_at 기준 개수 조회
      const { count } = await supabase
        .from('news_articles')
        .select('*', { count: 'exact', head: true }) // 데이터 없이 개수만
        .ilike('title', `%${keyword}%`)
        .gte('fetched_at', startDate)
        .lte('fetched_at', endDate)
      
      const newsCount = count || 0;

      // 1개 이상일 때만 발송
      if (newsCount > 0) {
        // 랜딩 페이지 링크 (로그인 불필요)
        const linkUrl = `${BASE_URL}/news/daily-summary?keyword=${encodeURIComponent(keyword)}&date=${todayKST}`

        const message = `🌅 <b>[오늘의 ${keyword} 브리핑]</b>\n\n`
          + `📅 기준: ${todayKST}\n`
          + `📊 수집된 뉴스: <b>총 ${newsCount}건</b>\n\n`
          + `👇 아래 링크에서 전체 뉴스와 주간 추이를 확인하세요.\n` 
          + `<a href="${linkUrl}">🔗 전체 뉴스 및 리포트 보러가기</a>`

        await Promise.all(subscriberIds.map(id => 
           fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ chat_id: id, text: message, parse_mode: 'HTML' })
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