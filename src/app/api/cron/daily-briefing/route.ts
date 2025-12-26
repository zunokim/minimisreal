// src/app/api/cron/daily-briefing/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
// 타임아웃 방지 (크롤링까지 할 수 있으므로 60초)
export const maxDuration = 60 

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// KST 날짜 (YYYY-MM-DD)
function getKSTDateString(date: Date) {
  const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  return kstDate.toISOString().split('T')[0];
}

// 네이버 검색 (최신순) - DB 없을 때 비상용
async function fetchTodayNews(keyword: string) {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  // 최신순(date)으로 50개 가져옴
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=50&sort=date`
  
  const res = await fetch(url, { headers: { 'X-Naver-Client-Id': clientId!, 'X-Naver-Client-Secret': clientSecret! } })
  const data = await res.json()
  return data.items || []
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
    const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    let sentCount = 0;
    const debugLogs: any[] = []

    for (const keyword of targetKeywords) {
      const startDate = `${todayKST}T00:00:00`
      const endDate = `${todayKST}T23:59:59`

      // 1. DB 조회
      const { count } = await supabase
        .from('news_articles')
        .select('*', { count: 'exact', head: true })
        .ilike('title', `%${keyword}%`)
        .gte('published_at', startDate)
        .lte('published_at', endDate)
      
      let finalCount = count || 0;
      let source = 'DB';

      // 2. [핵심] DB에 없으면 강제 크롤링 및 저장
      if (finalCount === 0) {
        source = 'NaverAPI (Fallback)';
        const items = await fetchTodayNews(keyword);
        
        // 오늘 날짜만 필터링
        const todayItems = items.filter((item: any) => {
          const itemDate = new Date(item.pubDate);
          return getKSTDateString(itemDate) === todayKST;
        });

        if (todayItems.length > 0) {
          // DB에 저장 (그래야 링크 클릭했을 때 보이니까)
          const itemsToInsert = todayItems.map((item: any) => ({
             title: item.title.replace(/<[^>]*>?/gm, ''),
             content: item.description,
             publisher: 'Naver Search',
             source_url: item.link,
             published_at: new Date(item.pubDate).toISOString(),
          }));

          // 중복 무시하고 저장 (upsert or ignore)
          await supabase.from('news_articles').upsert(itemsToInsert, { onConflict: 'source_url', ignoreDuplicates: true });
          
          finalCount = todayItems.length;
        }
      }

      debugLogs.push({ keyword, source, count: finalCount });

      // 3. 알림 발송
      if (finalCount > 0) {
        const linkUrl = `${BASE_URL}/news/daily-summary?keyword=${encodeURIComponent(keyword)}&date=${todayKST}`

        const message = `🌅 <b>[오늘의 ${keyword} 브리핑]</b>\n\n`
          + `📅 기준: ${todayKST}\n`
          + `📊 수집된 뉴스: <b>총 ${finalCount}건</b>\n\n`
          + `👇 아래 링크를 눌러 전체 뉴스를 확인하세요.\n` 
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

    return NextResponse.json({ success: true, sent_keywords: sentCount, logs: debugLogs })

  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}