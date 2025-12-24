// src/app/api/cron/news-alert/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNaverNews } from '@/lib/news/ingestNaver' // 기존 함수 재사용
import { sendTelegramMessage } from '@/lib/telegram'

// Admin 권한으로 DB 접근 (RLS 우회)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic' // 캐싱 방지

export async function GET(request: Request) {
  try {
    // 1. 보안 체크 (CRON_SECRET_KEY 확인)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. 활성화된 키워드 가져오기
    const { data: keywords, error: kError } = await supabase
      .from('alert_keywords')
      .select('keyword')
      .eq('is_active', true)

    if (kError || !keywords) {
      throw new Error('Failed to fetch keywords')
    }

    let newArticleCount = 0

    // 3. 각 키워드별로 뉴스 검색 및 처리
    for (const item of keywords) {
      const { keyword } = item
      // 기존에 만들어둔 네이버 뉴스 크롤링 함수 사용 (최신순 10개 정도만 가져오게 됨)
      const articles = await fetchNaverNews(keyword)

      for (const article of articles) {
        // 4. DB에 저장 시도 (INSERT IGNORE 방식)
        // onConflict가 source_url 기준이므로, 이미 있으면 아무것도 안함
        const { error, status } = await supabase
          .from('news_articles')
          .insert({
            title: article.title,
            content: article.description, // description을 content로 매핑
            publisher: 'Naver Search', // 혹은 originallink 도메인 파싱
            source_url: article.link,
            published_at: new Date(article.pubDate).toISOString(),
            title_hash: null, // 필요시 해시 생성
          })
          .select()

        // 5. 저장이 성공했다면(새로운 뉴스라면) 텔레그램 전송
        // Supabase insert 성공 시 status 201 반환. 중복이라 무시되면 에러가 나거나 201이 아님.
        // 하지만 insert()만 쓰면 중복시 에러가 발생하므로 error 코드를 확인해야 함.
        // 여기서는 에러가 '23505' (unique constraint)가 아닐 때만 성공으로 간주하거나,
        // 단순하게 insert 성공여부만 체크.
        
        // 더 확실한 방법: insert가 성공하면 data가 반환됨 (select() 체이닝 필요없음 오류시)
        if (!error && status === 201) {
            newArticleCount++
            const message = `
🚨 <b>[${keyword}] 관련 새 뉴스</b>

📰 <a href="${article.link}">${article.title.replace(/<[^>]*>?/gm, '')}</a>
Item: ${article.description.replace(/<[^>]*>?/gm, '').substring(0, 100)}...

pub: ${new Date(article.pubDate).toLocaleString('ko-KR')}
            `
            await sendTelegramMessage(message)
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed_keywords: keywords.length,
      new_articles_sent: newArticleCount,
    })

  } catch (error: any) {
    console.error('News Alert Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}