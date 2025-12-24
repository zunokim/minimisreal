import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' 

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

// 텔레그램 전체 발송 함수 (여러 명에게 동시에)
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
        parse_mode: 'HTML', // HTML 태그 사용
        disable_web_page_preview: true // 링크 미리보기 끄기 (깔끔하게)
      }),
    }).catch(e => console.error(`Send failed to ${chatId}`, e))
  )
  
  await Promise.all(promises)
}

export async function GET(request: Request) {
  try {
    // 1. 보안 체크
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. 키워드 및 구독자 가져오기
    const { data: keywordData } = await supabase.from('alert_keywords').select('keyword')
    if (!keywordData || keywordData.length === 0) {
      return NextResponse.json({ message: 'No keywords found' })
    }
    const keywords = keywordData.map(k => k.keyword)

    const { data: subsData } = await supabase
      .from('telegram_subscribers')
      .select('chat_id')
      .eq('is_active', true)
    
    if (!subsData || subsData.length === 0) {
      return NextResponse.json({ message: 'No active subscribers' })
    }
    const subscriberIds = subsData.map(s => s.chat_id)

    let totalSentMessages = 0
    const processedStats: any[] = []

    // 3. 키워드별로 뉴스 수집 및 묶음 발송
    for (const keyword of keywords) {
      const articles = await fetchNaverNews(keyword)
      
      // 이번 텀에 발송할 새 기사들을 담을 바구니
      const newArticlesToSend: any[] = []

      for (const article of articles) {
        // (A) 날짜 필터: 최근 20분 이내 기사인지 (테스트 시 60분 등으로 조절 가능)
        const pubDate = new Date(article.pubDate)
        const now = new Date()
        const diffMinutes = (now.getTime() - pubDate.getTime()) / (1000 * 60)

        if (diffMinutes > 20) continue 

        // (B) 중복 체크: DB에 있는지 확인
        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .eq('source_url', article.link)
          .single()

        // DB에 없으면(새 기사면) 바구니에 담기 + DB 저장
        if (!existing) {
           const cleanTitle = article.title.replace(/<[^>]*>?/gm, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
           
           // 바구니에 추가
           newArticlesToSend.push({
             title: cleanTitle,
             link: article.link,
             time: pubDate.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})
           })

           // DB에 즉시 저장 (다음 실행 때 중복 방지)
           await supabase.from('news_articles').insert({
              title: cleanTitle,
              content: article.description,
              publisher: 'Naver Search',
              source_url: article.link,
              published_at: pubDate.toISOString(),
           })
        }
      }

      // (C) 모인 기사가 있다면 '한 번에' 발송
      if (newArticlesToSend.length > 0) {
        // 메시지 만들기
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
    console.error('Cron Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}