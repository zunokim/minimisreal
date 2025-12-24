import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' 

// Vercel 타임아웃 60초
export const maxDuration = 60 
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// HTML 특수문자 이스케이프
function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 텔레그램 발송 함수
async function broadcastMessage(subscribers: string[], text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return [{ status: 'error', message: 'No Bot Token' }]

  const results = await Promise.all(subscribers.map(async (chatId) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }),
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        console.error(`Telegram Error (${chatId}):`, data)
        return { chatId, success: false, error: data }
      }
      return { chatId, success: true }

    } catch (e: any) {
      console.error(`Network Error (${chatId}):`, e)
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

    const { data: keywordData } = await supabase.from('alert_keywords').select('keyword')
    const keywords = keywordData?.map(k => k.keyword) || []

    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    if (keywords.length === 0 || subscriberIds.length === 0) {
      return NextResponse.json({ message: 'No keywords or subscribers' })
    }

    const debugLogs: any[] = []

    for (const keyword of keywords) {
      const articles = await fetchNaverNews(keyword)
      const newArticlesToSend: any[] = []

      for (const article of articles) {
        // [테스트] 시간 넉넉히 (실제 운영 시 20~60분 권장)
        const pubDate = new Date(article.pubDate)
        const diffMinutes = (new Date().getTime() - pubDate.getTime()) / (1000 * 60)

        // 테스트용: 720분(12시간) / 운영용: 60분
        if (diffMinutes > 720) continue 

        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .eq('source_url', article.link)
          .single()

        if (!existing) {
           let rawTitle = article.title.replace(/<[^>]*>?/gm, '');
           const safeTitle = escapeHtml(rawTitle);

           newArticlesToSend.push({
             safeTitle,
             rawTitle,
             link: article.link,
             time: pubDate.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'}),
             desc: article.description,
             pubDateStr: pubDate.toISOString()
           })
        }
      }

      // 수집된 새 기사가 있다면
      if (newArticlesToSend.length > 0) {
        // [수정] 15개씩 잘라서 보내기 (메시지 길이 제한 방지)
        const CHUNK_SIZE = 15;
        
        for (let i = 0; i < newArticlesToSend.length; i += CHUNK_SIZE) {
            const chunk = newArticlesToSend.slice(i, i + CHUNK_SIZE);
            
            let message = `📢 <b>[${keyword}] 새 소식 (${i + 1}~${i + chunk.length} / 전체 ${newArticlesToSend.length}건)</b>\n\n`
            
            chunk.forEach((item, index) => {
              // 번호는 전체 리스트 기준
              message += `${i + index + 1}. <a href="${item.link}">${item.safeTitle}</a>\n`
              message += `   <i>(${item.time})</i>\n\n`
            })

            // 발송
            const sendResult = await broadcastMessage(subscriberIds, message)
            
            debugLogs.push({
                keyword,
                batch: `${i/CHUNK_SIZE + 1}번째 묶음`,
                sent_count: chunk.length,
                result: sendResult
            })
        }

        // [수정] 발송한 '모든' 기사 DB 저장
        const itemsToInsert = newArticlesToSend.map(item => ({
            title: item.rawTitle,
            content: item.desc,
            publisher: 'Naver Search',
            source_url: item.link,
            published_at: item.pubDateStr,
        }))
        
        if (itemsToInsert.length > 0) {
            await supabase.from('news_articles').insert(itemsToInsert)
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      logs: debugLogs 
    })

  } catch (error: any) {
    console.error('Final Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}