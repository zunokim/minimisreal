// src/app/api/cron/daily-briefing/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

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

    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    if (subscriberIds.length === 0) return NextResponse.json({ message: 'No subscribers' })
    
    const token = process.env.TELEGRAM_BOT_TOKEN
    const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    
    const todayLabel = getKSTDateString(); // 예: 2025-12-29
    
    // [변경] published_at 기준 쿼리
    // 한국 시간 00:00:00+09 ~ 23:59:59+09
    const startISO = `${todayLabel}T00:00:00+09:00`
    const endISO = `${todayLabel}T23:59:59+09:00`

    // 오늘 발행된(published_at) 기사 개수 조회
    const { count, error } = await supabase
      .from('news_articles')
      .select('*', { count: 'exact', head: true }) 
      .gte('published_at', startISO) // fetched_at 대신 published_at 사용
      .lte('published_at', endISO)
    
    const newsCount = count || 0;

    if (newsCount > 0) {
      const linkUrl = `${BASE_URL}/news/daily-summary?date=${todayLabel}`

      const message = `🌅 <b>[오늘의 뉴스 브리핑]</b>\n\n`
        + `📅 기준: ${todayLabel}\n`
        + `📊 발행된 뉴스: <b>총 ${newsCount}건</b>\n\n`
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
      query_date: todayLabel 
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}