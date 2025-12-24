import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' 

// 1. Vercel 타임아웃을 60초로 연장 (무료 플랜 최대치)
export const maxDuration = 60 
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// HTML 특수문자 이스케이프 (텔레그램 파싱 에러 방지)
function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 텔레그램 발송 함수 (결과를 반환하도록 수정)
async function broadcastMessage(subscribers: string[], text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return [{ status: 'error', message: 'No Bot Token' }]

  // 모든 구독자에게 전송 시도
  const results = await Promise.all(subscribers.map(async (chatId) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML', // HTML 모드 사용
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
    // 2. 실행 권한 체크
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 3. 데이터 준비
    const { data: keywordData } = await supabase.from('alert_keywords').select('keyword')
    const keywords = keywordData?.map(k => k.keyword) || []

    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    if (keywords.length === 0 || subscriberIds.length === 0) {
      return NextResponse.json({ message: 'No keywords or subscribers' })
    }

    const debugLogs: any[] = [] // 결과 확인용 로그

    // 4. 키워드별 처리
    for (const keyword of keywords) {
      const articles = await fetchNaverNews(keyword)
      const newArticlesToSend: any[] = []

      for (const article of articles) {
        // 날짜 필터 (테스트를 위해 12시간으로 넉넉하게 설정)
        const pubDate = new Date(article.pubDate)
        const diffMinutes = (new Date().getTime() - pubDate.getTime()) / (1000 * 60)

        if (diffMinutes > 720) continue 

        // 중복 체크
        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .eq('source_url', article.link)
          .single()

        if (!existing) {
           // 제목 정제
           let rawTitle = article.title.replace(/<[^>]*>?/gm, '');
           const safeTitle = escapeHtml(rawTitle);

           newArticlesToSend.push({
             safeTitle, // 발송용
             rawTitle,  // DB저장용
             link: article.link,
             time: pubDate.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'}),
             desc: article.description,
             pubDateStr: pubDate.toISOString()
           })
        }
      }

      // 5. [핵심] 너무 많으면 잘라서 보내기 (최대 5개)
      // 데이터가 많으면 메시지 길이가 4096자를 넘거나 타임아웃 발생함
      const limitedArticles = newArticlesToSend.slice(0, 5); 

      if (limitedArticles.length > 0) {
        let message = `📢 <b>[${keyword}] 새 소식 (${limitedArticles.length}건)</b>\n\n`
        
        limitedArticles.forEach((item, index) => {
          message += `${index + 1}. <a href="${item.link}">${item.safeTitle}</a>\n`
          message += `   <small>(${item.time})</small>\n\n`
        })

        // 추가된 기사가 더 있다면 알려주기
        if (newArticlesToSend.length > 5) {
            message += `<i>외 ${newArticlesToSend.length - 5}건의 추가 소식이 있습니다.</i>`
        }

        // 전송 및 결과 받기
        const sendResult = await broadcastMessage(subscriberIds, message)
        
        debugLogs.push({
          keyword,
          articles_found: newArticlesToSend.length,
          articles_sent: limitedArticles.length,
          telegram_result: sendResult // 여기에 에러 원인이 찍힘
        })

        // 6. DB 저장 (전송 성공 여부와 관계없이 저장하여 중복 방지)
        // 한꺼번에 insert하여 속도 향상
        const itemsToInsert = limitedArticles.map(item => ({
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

    // 7. 결과 리턴 (cron-job.org 히스토리에서 확인 가능)
    return NextResponse.json({ 
      success: true, 
      logs: debugLogs 
    })

  } catch (error: any) {
    console.error('Final Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}