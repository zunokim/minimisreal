import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' 

export const maxDuration = 60 
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  if (!token) return [{ status: 'error', message: 'No Bot Token' }]

  const results = await Promise.all(subscribers.map(async (chatId) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true
        }),
      })
      const data = await res.json()
      if (!res.ok) return { chatId, success: false, error: data }
      return { chatId, success: true }
    } catch (e: any) {
      return { chatId, success: false, error: e.message }
    }
  }))
  return results
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: keywordData } = await supabase.from('alert_keywords').select('keyword, alert_filter')
    const keywords = keywordData || []

    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    const debugLogs: any[] = []

    for (const kItem of keywords) {
      const { keyword, alert_filter } = kItem
      const articles = await fetchNaverNews(keyword)
      
      const articlesToSave: any[] = [] 
      const articlesToSend: any[] = [] 

      for (const article of articles) {
        // [테스트 팁] 평소엔 20~60분, 테스트 시 720분
        const pubDate = new Date(article.pubDate)
        const diffMinutes = (new Date().getTime() - pubDate.getTime()) / (1000 * 60)
        
        if (diffMinutes > 60) continue 

        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .eq('source_url', article.link)
          .single()

        if (!existing) {
           let rawTitle = article.title.replace(/<[^>]*>?/gm, '');
           const safeTitle = escapeHtml(rawTitle);
           
           const itemData = {
             safeTitle, rawTitle, link: article.link,
             time: pubDate.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'}),
             desc: article.description, pubDateStr: pubDate.toISOString()
           }

           articlesToSave.push(itemData)

           // --- [변경] 필터 매칭 로직 강화 ---
           let shouldNotify = true
           let matchedFilters: string[] = [] // 어떤 키워드에 걸렸는지 저장

           if (alert_filter) {
             const filterKeywords = alert_filter.split(',').map((s: string) => s.trim())
             const targetText = (rawTitle + article.description).toLowerCase()
             
             // 하나라도 포함된 게 있는지 찾아서 저장
             matchedFilters = filterKeywords.filter((f: string) => targetText.includes(f.toLowerCase()))
             shouldNotify = matchedFilters.length > 0
           }

           if (shouldNotify) {
             // 데이터에 걸린 키워드 정보(matchedFilters)를 같이 넣음
             articlesToSend.push({ ...itemData, triggers: matchedFilters })
           }
        }
      }

      if (articlesToSave.length > 0) {
        await supabase.from('news_articles').insert(articlesToSave.map(item => ({
            title: item.rawTitle, content: item.desc, publisher: 'Naver Search',
            source_url: item.link, published_at: item.pubDateStr,
        })))
      }

      if (articlesToSend.length > 0) {
        const CHUNK_SIZE = 15;
        for (let i = 0; i < articlesToSend.length; i += CHUNK_SIZE) {
            const chunk = articlesToSend.slice(i, i + CHUNK_SIZE);
            let message = `📢 <b>[${keyword}] 관련 소식 (${chunk.length}건)</b>\n\n`
            
            chunk.forEach((item, index) => {
              message += `${i + index + 1}. <a href="${item.link}">${item.safeTitle}</a>\n`
              
              // --- [변경] 감지된 키워드 표시 ---
              // 알림 조건(triggers)이 존재하면 표시, 없으면(전체수집) 표시 안 함
              if (item.triggers && item.triggers.length > 0) {
                  message += `   🎯 <i>감지: ${item.triggers.join(', ')}</i>\n`
              }
              
              message += `   <i>(${item.time})</i>\n\n`
            })

            const sendResult = await broadcastMessage(subscriberIds, message)
            debugLogs.push({ keyword, sent: articlesToSend.length, result: sendResult })
        }
      }
    }

    return NextResponse.json({ success: true, logs: debugLogs })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}