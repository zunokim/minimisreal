// src/app/api/cron/daily-briefing/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 한국 시간(KST) 00:00:00에 해당하는 UTC 시간 구하기
function getStartOfTodayKST_inUTC() {
  const now = new Date();
  
  // 1. 현재 시간을 한국 시간으로 변환된 객체 생성
  const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  
  // 2. 한국 시간 기준 '오늘의 0시 0분 0초' 설정
  kstNow.setUTCHours(0, 0, 0, 0);
  
  // 3. 그걸 다시 UTC로 되돌림 (한국 0시는 UTC로는 전날 15시)
  // 예: 한국 29일 00:00 -> UTC 28일 15:00
  const startOfTodayUTC = new Date(kstNow.getTime() - (9 * 60 * 60 * 1000));
  
  return startOfTodayUTC.toISOString();
}

// 한국 날짜 문자열 (YYYY-MM-DD) - 표시용
function getKSTDateString() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return kstNow.toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const targetKeywords = ['한화투자증권', '한화증권']
    
    // 구독자 가져오기
    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    if (subscriberIds.length === 0) return NextResponse.json({ message: 'No subscribers' })
    
    const token = process.env.TELEGRAM_BOT_TOKEN
    const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    
    // [핵심] 검색 기준 시간 설정 (한국시간 0시부터 ~ 현재까지)
    const startTimeUTC = getStartOfTodayKST_inUTC(); // 예: 2025-12-28T15:00:00.000Z
    const todayLabel = getKSTDateString(); // 예: 2025-12-29

    let sentCount = 0;
    const debugLogs: any[] = []

    for (const keyword of targetKeywords) {
      // DB 조회: fetched_at이 startTimeUTC보다 큰 것들
      const { count, error } = await supabase
        .from('news_articles')
        .select('*', { count: 'exact', head: true }) 
        .ilike('title', `%${keyword}%`)
        .gte('fetched_at', startTimeUTC) // 여기가 수정된 핵심 포인트!
      
      const newsCount = count || 0;

      debugLogs.push({
        keyword,
        check_since_utc: startTimeUTC,
        found_count: newsCount,
        error: error ? error.message : null
      });

      // 1개 이상일 때 발송
      if (newsCount > 0) {
        const linkUrl = `${BASE_URL}/news/daily-summary?keyword=${encodeURIComponent(keyword)}&date=${todayLabel}`

        const message = `🌅 <b>[오늘의 ${keyword} 브리핑]</b>\n\n`
          + `📅 기준: ${todayLabel}\n`
          + `📊 수집된 뉴스: <b>총 ${newsCount}건</b>\n\n`
          + `👇 아래 링크에서 전체 뉴스와 리포트를 확인하세요.\n` 
          + `<a href="${linkUrl}">🔗 전체 뉴스 보러가기</a>`

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

    // 결과에 로그 포함 (cron-job.org history에서 확인 가능)
    return NextResponse.json({ 
      success: true, 
      sent_keywords: sentCount,
      debug_logs: debugLogs 
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}