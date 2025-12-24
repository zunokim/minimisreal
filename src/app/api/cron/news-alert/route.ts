// src/app/api/cron/news-alert/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' 

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

async function broadcastMessage(subscribers: string[], text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  // 한 명씩 전송 (실제 운영 시에는 Queue나 Batch 처리 권장)
  const promises = subscribers.map(chatId => 
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    }).catch(e => console.error(`Send fail to ${chatId}`, e))
  )
  await Promise.all(promises)
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. [관리자 설정] 키워드 목록 가져오기
    const { data: keywordData } = await supabase.from('alert_keywords').select('keyword')
    if (!keywordData || keywordData.length === 0) return NextResponse.json({ message: 'No keywords' })
    const keywords = keywordData.map(k => k.keyword)

    // 2. [구독자] 활성화된 구독자 목록 가져오기
    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    if (!subsData || subsData.length === 0) return NextResponse.json({ message: 'No subscribers' })
    const subscriberIds = subsData.map(s => s.chat_id)

    let totalSent = 0

    // 3. 키워드별 뉴스 검색 및 방송
    for (const keyword of keywords) {
      const articles = await fetchNaverNews(keyword)

      for (const article of articles) {
        // "최근 20분 내 기사"만 필터링
        const pubDate = new Date(article.pubDate)
        const diffMinutes = (new Date().getTime() - pubDate.getTime()) / (1000 * 60)

        if (diffMinutes <= 20) {
           const cleanTitle = article.title.replace(/<[^>]*>?/gm, '')
           const message = `
📢 <b>[${keyword}] 속보</b>
<a href="${article.link}">${cleanTitle}</a>
<small>${pubDate.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})}</small>
           `
           // 모든 구독자에게 전송 (Broadcast)
           await broadcastMessage(subscriberIds, message)
           totalSent += subscriberIds.length
        }

        // 히스토리 저장
        await supabase.from('news_articles').upsert({
            title: article.title,
            content: article.description,
            publisher: 'Naver',
            source_url: article.link,
            published_at: pubDate.toISOString(),
        }, { onConflict: 'source_url' })
      }
    }

    return NextResponse.json({ success: true, broadcast_count: totalSent })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}