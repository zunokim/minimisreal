// src/app/api/cron/news-alert/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' 

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

// HTML 특수문자 이스케이프 함수 (텔레그램 오류 방지용)
function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function broadcastMessage(subscribers: string[], text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return

  const promises = subscribers.map(chatId => 
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
    }).catch(e => console.error(`Send failed to ${chatId}`, e))
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
    if (!subsData || subsData.length === 0) return NextResponse.json({ message: 'No active subscribers' })
    const subscriberIds = subsData.map(s => s.chat_id)

    let totalSentMessages = 0
    const processedStats: any[] = []

    for (const keyword of keywords) {
      const articles = await fetchNaverNews(keyword)
      const newArticlesToSend: any[] = []

      for (const article of articles) {
        const pubDate = new Date(article.pubDate)
        const now = new Date()
        const diffMinutes = (now.getTime() - pubDate.getTime()) / (1000 * 60)

        // [테스트 팁] 안 온다면 여기를 720(12시간)으로 늘려서 테스트하세요. 평소엔 20~60 추천.
        if (diffMinutes > 60) continue 

        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .eq('source_url', article.link)
          .single()

        if (!existing) {
           // 1. 태그 제거 (<b> 등)
           let rawTitle = article.title.replace(/<[^>]*>?/gm, '');
           // 2. 텔레그램용 특수문자 변환 (매우 중요!)
           const safeTitle = escapeHtml(rawTitle);

           newArticlesToSend.push({
             title: safeTitle,
             link: article.link,
             time: pubDate.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})
           })

           await supabase.from('news_articles').insert({
              title: rawTitle, // DB엔 원본(태그만 뗀) 저장
              content: article.description,
              publisher: 'Naver Search',
              source_url: article.link,
              published_at: pubDate.toISOString(),
           })
        }
      }

      if (newArticlesToSend.length > 0) {
        let message = `📢 <b>[${keyword}] 새 소식 (${newArticlesToSend.length}건)</b>\n\n`
        
        newArticlesToSend.forEach((item, index) => {
          message += `${index + 1}. <a href="${item.link}">${item.title}</a>\n`
          message += `   <small>(${item.time})</small>\n\n`
        })

        await broadcastMessage(subscriberIds, message)
        totalSentMessages++
        processedStats.push({ keyword, count: newArticlesToSend.length })
      }
    }

    return NextResponse.json({ 
      success: true, 
      stats: processedStats,
      total_messages_sent: totalSentMessages
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}