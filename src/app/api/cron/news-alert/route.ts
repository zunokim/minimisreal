//src\app\api\cron\news-alert\route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' 
import crypto from 'crypto' // [추가] 해시 생성을 위한 모듈

export const maxDuration = 60 
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// [추가] 제목으로 고유 해시값 만들기 (MD5 사용)
function generateTitleHash(title: string) {
  return crypto.createHash('md5').update(title).digest('hex');
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
        const pubDate = new Date(article.pubDate)
        const diffMinutes = (new Date().getTime() - pubDate.getTime()) / (1000 * 60)
        
        if (diffMinutes > 60) continue 

        // [변경] 제목 정제 및 해시 생성
        let rawTitle = article.title.replace(/<[^>]*>?/gm, ''); // 태그 제거된 순수 제목
        const safeTitle = escapeHtml(rawTitle); // 텔레그램 전송용
        const titleHash = generateTitleHash(rawTitle); // [추가] 제목 해시 생성

        // [변경] 중복 체크 로직 강화 (URL 또는 제목해시로 체크)
        // 네이버가 가끔 같은 기사인데 URL 파라미터만 바꿔서 주는 경우가 있어서 해시 체크가 유용함
        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .or(`source_url.eq.${article.link},title_hash.eq.${titleHash}`) // URL 혹은 해시가 같으면 중복
          .maybeSingle() // single() 대신 maybeSingle() 사용 (에러 방지)

        if (!existing) {
           const itemData = {
             safeTitle, rawTitle, link: article.link,
             time: pubDate.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'}),
             desc: article.description, pubDateStr: pubDate.toISOString(),
             titleHash // 저장할 때 사용
           }

           articlesToSave.push(itemData)

           let shouldNotify = true
           let matchedFilters: string[] = []

           if (alert_filter) {
             const filterKeywords = alert_filter.split(',').map((s: string) => s.trim())
             const targetText = (rawTitle + article.description).toLowerCase()
             
             matchedFilters = filterKeywords.filter((f: string) => targetText.includes(f.toLowerCase()))
             shouldNotify = matchedFilters.length > 0
           }

           if (shouldNotify) {
             articlesToSend.push({ ...itemData, triggers: matchedFilters })
           }
        }
      }

      // [DB 저장 부분 수정] title_hash 추가
      if (articlesToSave.length > 0) {
        await supabase.from('news_articles').insert(articlesToSave.map(item => ({
            title: item.rawTitle, 
            content: item.desc, 
            publisher: 'Naver Search', // 여전히 하드코딩 (API 한계)
            source_url: item.link, 
            published_at: item.pubDateStr,
            title_hash: item.titleHash // [추가] 이제 DB에 들어갑니다!
        })))
      }

      if (articlesToSend.length > 0) {
        const CHUNK_SIZE = 15;
        for (let i = 0; i < articlesToSend.length; i += CHUNK_SIZE) {
            const chunk = articlesToSend.slice(i, i + CHUNK_SIZE);
            let message = `📢 <b>[${keyword}] 관련 소식 (${chunk.length}건)</b>\n\n`
            
            chunk.forEach((item, index) => {
              message += `${i + index + 1}. <a href="${item.link}">${item.safeTitle}</a>\n`
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