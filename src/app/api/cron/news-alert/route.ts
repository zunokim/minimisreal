// src/app/api/cron/news-alert/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' 

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

// [수정 1] 전송 결과를 리턴하도록 함수 변경
async function broadcastMessage(subscribers: string[], text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return [{ status: 'error', message: 'No Bot Token in Env' }]

  const results = await Promise.all(subscribers.map(async (chatId) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
        }),
      })
      const data = await res.json()
      return { chatId, ok: res.ok, telegram_response: data }
    } catch (e: any) {
      return { chatId, ok: false, error: e.message }
    }
  }))
  return results
}

export async function GET(request: Request) {
  try {
    // ... (권한 체크 부분 생략 - 그대로 두세요) ...
    // 편의상 인증 체크 부분은 유지하시되, 테스트를 위해 주석처리 하셔도 됩니다.
    
    // ... (키워드/구독자 가져오는 부분 생략 - 그대로 두세요) ...
    // 아래 코드는 기존 코드의 2, 3번 단계(키워드/구독자 조회)가 있다고 가정합니다.
    
    // [잠시 테스트용] 로직 흐름 확인을 위해 코드를 다시 씁니다.
    // 기존에 작성하신 상단 import, supabase 설정, GET 시작 부분은 유지하세요.
    
    // (여기서부터 기존 로직 내부에 붙여넣으세요)
    const { data: keywordData } = await supabase.from('alert_keywords').select('keyword')
    const keywords = keywordData?.map(k => k.keyword) || []
    
    const { data: subsData } = await supabase.from('telegram_subscribers').select('chat_id').eq('is_active', true)
    const subscriberIds = subsData?.map(s => s.chat_id) || []

    // 디버깅용 로그 저장소
    const debugLogs: any[] = []

    for (const keyword of keywords) {
      const articles = await fetchNaverNews(keyword)

      for (const article of articles) {
        // [테스트] 시간 제한을 12시간(720분)으로 늘림
        const pubDate = new Date(article.pubDate)
        const diffMinutes = (new Date().getTime() - pubDate.getTime()) / (1000 * 60)
        
        if (diffMinutes > 720) continue 

        // 중복 체크
        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .eq('source_url', article.link)
          .single()

        // [중요] 디버깅을 위해 '기존에 있어도' 테스트 시엔 강제로 보내보거나, 
        // 로그를 남깁니다. 여기선 '없을 때만 보냄' 유지하되 로그 추가.
        
        if (!existing) {
           const cleanTitle = article.title.replace(/<[^>]*>?/gm, '')
           const message = `📢 [${keyword}] ${cleanTitle}\n${article.link}`
           
           // [수정 2] 전송 결과 받기
           const sendResult = await broadcastMessage(subscriberIds, message)
           debugLogs.push({ 
             type: 'SEND_ATTEMPT', 
             article: cleanTitle, 
             result: sendResult 
           })

           // DB 저장
           await supabase.from('news_articles').insert({
              title: cleanTitle,
              content: article.description,
              publisher: 'Naver',
              source_url: article.link,
              published_at: pubDate.toISOString(),
           })
        } else {
            // 중복이라 안 보낸 것도 로그에 남김
            debugLogs.push({ type: 'SKIP_DUPLICATE', article: article.title })
        }
      }
    }

    // [수정 3] 결과 JSON에 상세 로그 포함
    return NextResponse.json({ 
      success: true, 
      debug_logs: debugLogs 
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}