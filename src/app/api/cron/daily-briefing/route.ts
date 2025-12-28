// src/app/api/cron/daily-briefing/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 한국 시간 기준 00:00:00에 해당하는 UTC 시간 계산
function getStartOfTodayKST_inUTC() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // 한국 시간 변환
  kstNow.setUTCHours(0, 0, 0, 0); // 한국 시간 0시로 설정
  const startOfTodayUTC = new Date(kstNow.getTime() - (9 * 60 * 60 * 1000)); // 다시 UTC로
  return startOfTodayUTC.toISOString();
}

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

    // 구독자 조회
    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    if (subscriberIds.length === 0) return NextResponse.json({ message: 'No subscribers' })
    
    const token = process.env.TELEGRAM_BOT_TOKEN
    const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    
    // 시간 설정
    const startTimeUTC = getStartOfTodayKST_inUTC();
    const todayLabel = getKSTDateString();

    // [변경] 특정 키워드 필터 없이, 오늘 수집된(fetched_at) '모든' 기사 카운트
    // (이미 수집 단계에서 한화 관련 기사만 DB에 넣고 있으므로 전체를 세면 됨)
    const { count, error } = await supabase
      .from('news_articles')
      .select('*', { count: 'exact', head: true }) 
      .gte('fetched_at', startTimeUTC)
    
    const newsCount = count || 0;

    if (newsCount > 0) {
      // 링크에 keyword 파라미터 제거 (전체 보기 위함)
      const linkUrl = `${BASE_URL}/news/daily-summary?date=${todayLabel}`

      const message = `🌅 <b>[오늘의 뉴스 브리핑]</b>\n\n`
        + `📅 기준: ${todayLabel}\n`
        + `📊 수집된 뉴스: <b>총 ${newsCount}건</b>\n\n`
        + `👇 아래 링크에서 전체 뉴스를 확인하세요.\n` 
        + `<a href="${linkUrl}">🔗 전체 뉴스 보러가기</a>`

      await Promise.all(subscriberIds.map(id => 
          fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: id, text: message, parse_mode: 'HTML' })
          })
      ))
    }

    return NextResponse.json({ 
      success: true, 
      sent_count: newsCount,
      check_since_utc: startTimeUTC 
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}