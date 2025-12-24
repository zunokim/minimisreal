// src/app/api/cron/news-alert/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' 

// ⚠️ 중요: Cron 작업은 RLS(보안정책)를 우회해야 하므로 SERVICE_ROLE_KEY를 사용합니다.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 정적 캐싱 방지 (항상 최신 실행)
export const dynamic = 'force-dynamic'

// 텔레그램 전체 발송 함수
async function broadcastMessage(subscribers: string[], text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return

  // Promise.all로 병렬 전송 (속도 향상)
  const promises = subscribers.map(chatId => 
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML', // HTML 태그 사용 허용
      }),
    }).catch(e => console.error(`Send failed to ${chatId}`, e))
  )
  
  await Promise.all(promises)
}

export async function GET(request: Request) {
  try {
    // 1. 보안 체크 (Cron Secret Key)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. [관리자 설정] 키워드 목록 가져오기
    const { data: keywordData } = await supabase.from('alert_keywords').select('keyword')
    if (!keywordData || keywordData.length === 0) {
      return NextResponse.json({ message: 'No keywords found' })
    }
    const keywords = keywordData.map(k => k.keyword)

    // 3. [구독자] 활성화된 구독자 목록 가져오기
    const { data: subsData } = await supabase
      .from('telegram_subscribers')
      .select('chat_id')
      .eq('is_active', true)
    
    if (!subsData || subsData.length === 0) {
      return NextResponse.json({ message: 'No active subscribers' })
    }
    const subscriberIds = subsData.map(s => s.chat_id)

    let totalSent = 0

    // 4. 각 키워드별 뉴스 검색 및 처리
    for (const keyword of keywords) {
      // 네이버 API 호출
      const articles = await fetchNaverNews(keyword)

      for (const article of articles) {
        // (A) 날짜 필터: 최근 20분 이내 기사인지 확인
        const pubDate = new Date(article.pubDate)
        const now = new Date()
        const diffMinutes = (now.getTime() - pubDate.getTime()) / (1000 * 60)

        // 20분이 지났으면 건너뜀 (뒷북 방지)
        // 단, 미래 시간(서버 시간차)일 수도 있으니 음수는 허용
        if (diffMinutes > 20) continue 

        // (B) 중복 방지: DB에 이미 저장된 뉴스인지 확인
        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .eq('source_url', article.link)
          .single()

        // DB에 없을 때만(새로운 뉴스일 때만) 처리
        if (!existing) {
           const cleanTitle = article.title.replace(/<[^>]*>?/gm, '')
           const cleanDesc = article.description.replace(/<[^>]*>?/gm, '')
           
           const message = `
📢 <b>[${keyword}] 뉴스</b>

📰 <a href="${article.link}">${cleanTitle}</a>

<small>${pubDate.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})}</small>
           `
           
           // (C) 구독자 전체에게 발송
           await broadcastMessage(subscriberIds, message)
           totalSent += subscriberIds.length

           // (D) 발송 후 DB에 저장 (중복 처리 방지용)
           await supabase.from('news_articles').insert({
              title: cleanTitle, // 태그 제거된 제목 저장
              content: cleanDesc,
              publisher: 'Naver Search',
              source_url: article.link,
              published_at: pubDate.toISOString(),
           })
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed_keywords: keywords.length,
      broadcast_count: totalSent 
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('Cron Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}