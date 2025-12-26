// src/app/news/daily-summary/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

// 서스펜스 래퍼 (Next.js 빌드 에러 방지용)
export default function DailySummaryPage() {
  return (
    <Suspense fallback={<div className="p-6">로딩 중...</div>}>
      <SummaryContent />
    </Suspense>
  )
}

function SummaryContent() {
  const searchParams = useSearchParams()
  const keyword = searchParams.get('keyword') || ''
  const date = searchParams.get('date') || ''
  
  const [articles, setArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    if (!keyword || !date) return

    const fetchNews = async () => {
      setLoading(true)
      
      // DB에서 해당 날짜(한국시간 기준)의 기사를 가져옴
      // published_at은 ISO string이므로 날짜 부분만 검색하려면 범위 검색 필요
      // 간단하게 하기 위해 넉넉하게 가져와서 필터링하거나, range query 사용
      
      const startDate = `${date}T00:00:00`
      const endDate = `${date}T23:59:59`

      // 1. 해당 키워드가 포함된 기사 검색
      // 2. published_at 기준으로 오늘 날짜 필터링
      const { data, error } = await supabase
        .from('news_articles')
        .select('*')
        .ilike('title', `%${keyword}%`) // 제목에 키워드 포함
        .gte('published_at', startDate) // 오늘 00시 이후
        .lte('published_at', endDate)   // 오늘 23시 59분 이전
        .order('published_at', { ascending: false })

      if (data) setArticles(data)
      setLoading(false)
    }

    fetchNews()
  }, [keyword, date, supabase])

  if (!keyword || !date) return <div className="p-6">잘못된 접근입니다.</div>

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          📰 오늘의 <span className="text-blue-600">{keyword}</span> 뉴스
        </h1>
        <p className="text-gray-500">{date} 기준 브리핑</p>
      </header>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4 px-2">
            <span className="font-bold text-gray-700">총 {articles.length}건</span>
          </div>

          {articles.length === 0 ? (
            <div className="text-center py-20 bg-gray-50 rounded-xl text-gray-400 border border-dashed">
              수집된 뉴스가 없습니다.
            </div>
          ) : (
            articles.map((item) => (
              <a 
                key={item.id} 
                href={item.source_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-5 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md hover:border-blue-200 transition group"
              >
                <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 mb-2 line-clamp-2">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                  {item.content ? item.content.replace(/<[^>]*>?/gm, '') : ''}
                </p>
                <div className="flex justify-between items-center text-xs text-gray-400">
                  <span>{item.publisher || 'Naver Search'}</span>
                  <span>{new Date(item.published_at).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})}</span>
                </div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  )
}