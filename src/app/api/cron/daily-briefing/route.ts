// src/app/api/cron/daily-briefing/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
// 타임아웃 방지를 위해 실행 시간 연장 (60초)
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 한국 날짜 문자열 (YYYY-MM-DD)
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

    // 1. 구독자 목록 가져오기
    const { data: subsData } = await supabase
      .from('telegram_subscribers')
      .select('chat_id')
      .eq('is_active', true)
    
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    if (subscriberIds.length === 0) return NextResponse.json({ message: 'No subscribers' })
    
    const token = process.env.TELEGRAM_BOT_TOKEN
    const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const todayLabel = getKSTDateString(); 
    
    // published_at 기준 쿼리
    const startISO = `${todayLabel}T00:00:00+09:00`
    const endISO = `${todayLabel}T23:59:59+09:00`

    // 2. 오늘 뉴스 개수 확인
    const { count, error } = await supabase
      .from('news_articles')
      .select('*', { count: 'exact', head: true }) 
      .gte('published_at', startISO)
      .lte('published_at', endISO)
    
    const newsCount = count || 0;
    
    // 결과 리포트용 변수
    let successCount = 0;
    let failedList: { chat_id: number, reason: string }[] = [];

    if (newsCount > 0) {
      const linkUrl = `${BASE_URL}/news/daily-summary?date=${todayLabel}`

      const message = `🌅 <b>[오늘의 뉴스 브리핑]</b>\n\n`
        + `📅 기준: ${todayLabel}\n`
        + `📊 발행된 뉴스: <b>총 ${newsCount}건</b>\n\n`
        + `👇 아래 링크에서 전체 뉴스를 확인하세요.\n` 
        + `<a href="${linkUrl}">🔗 전체 뉴스 보러가기</a>`

      // 3. [변경] 한 명씩 발송하고 결과를 추적함
      const results = await Promise.all(subscriberIds.map(async (chat_id) => {
          try {
            const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chat_id, text: message, parse_mode: 'HTML' })
            })

            const json = await res.json()

            if (!json.ok) {
                // 텔레그램 API가 에러를 뱉은 경우 (예: 차단됨)
                return { success: false, chat_id, reason: json.description }
            }
            
            return { success: true, chat_id }

          } catch (e: any) {
            // 네트워크 에러 등
            return { success: false, chat_id, reason: e.message || 'Network Error' }
          }
      }))

      // 4. 결과 집계
      results.forEach(r => {
          if (r.success) {
              successCount++;
          } else {
              failedList.push({ chat_id: r.chat_id, reason: r.reason || 'Unknown' });
          }
      });
    }

    // 5. [변경] 최종 응답에 실패자 명단 포함
    return NextResponse.json({ 
      success: true, 
      query_date: todayLabel,
      news_count: newsCount,
      send_result: {
          total_targets: subscriberIds.length,
          success: successCount,
          failed: failedList.length,
          failed_details: failedList // 여기에 실패한 사람 ID와 이유가 나옴
      }
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}