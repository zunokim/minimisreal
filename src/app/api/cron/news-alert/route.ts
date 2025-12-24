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

    const { data: keywordData } = await supabase.from('alert_keywords').select('keyword')
    if (!keywordData || keywordData.length === 0) return NextResponse.json({ message: 'No keywords' })
    const keywords = keywordData.map(k => k.keyword)

    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    if (!subsData || subsData.length === 0) return NextResponse.json({ message: 'No subscribers' })
    const subscriberIds = subsData.map(s => s.chat_id)

    let totalSent = 0

    for (const keyword of keywords) {
      const articles = await fetchNaverNews(keyword)

      for (const article of articles) {
        const pubDate = new Date(article.pubDate)
        const diffMinutes = (new Date().getTime() - pubDate.getTime()) / (1000 * 60)

        if (diffMinutes <= 20) {
           const cleanTitle = article.title.replace(/<[^>]*>?/gm, '')
           const message = `
📢 <b>[${keyword}] 속보</b>
<a href="${article.link}">${cleanTitle}</a>
<small>${pubDate.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})}</small>
           `
           await broadcastMessage(subscriberIds, message)
           totalSent += subscriberIds.length
        }

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

  } catch (error: unknown) {
    // any 대신 unknown을 쓰고, Error 인스턴스인지 확인
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}