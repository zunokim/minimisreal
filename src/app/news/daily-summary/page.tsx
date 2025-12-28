// src/app/news/daily-summary/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { CalendarDays, Newspaper, Search } from 'lucide-react'

// 하이라이팅 컴포넌트 (검색어가 있으면 옅은 주황색 배경)
const HighlightText = ({ text, keyword }: { text: string, keyword: string }) => {
  if (!keyword || !text) return <>{text}</>
  
  const parts = text.split(new RegExp(`(${keyword})`, 'gi'))
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === keyword.toLowerCase() ? (
          <span key={i} className="bg-orange-100 text-orange-700 font-bold px-0.5 rounded">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  )
}

export default function DailySummaryPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-orange-600">데이터를 불러오는 중...</div>}>
      <SummaryContent />
    </Suspense>
  )
}

function SummaryContent() {
  const searchParams = useSearchParams()
  const dateParam = searchParams.get('date') || ''
  // URL에 키워드가 없으면 기본적으로 '한화'를 강조 (원하시면 변경 가능)
  const [keyword, setKeyword] = useState('한화') 
  
  const [articles, setArticles] = useState<any[]>([])
  const [chartData, setChartData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    if (!dateParam) return

    const fetchData = async () => {
      setLoading(true)

      // [핵심] 클라이언트에서도 타임존(KST -> UTC) 정확히 계산
      // dateParam (예: 2025-12-29) -> 한국 00시 -> UTC 전날 15시
      const targetDate = new Date(dateParam)
      const kstOffset = 9 * 60 * 60 * 1000
      
      // 한국 시간 0시 0분 0초에 해당하는 UTC 타임스탬프
      const startTimestamp = targetDate.getTime() - kstOffset
      const startUTC = new Date(startTimestamp).toISOString()
      
      // 한국 시간 23시 59분 59초에 해당하는 UTC 타임스탬프
      const endTimestamp = targetDate.getTime() - kstOffset + (24 * 60 * 60 * 1000) - 1
      const endUTC = new Date(endTimestamp).toISOString()

      // 1. 오늘의 뉴스 가져오기 (전체)
      const { data: todayNews } = await supabase
        .from('news_articles')
        .select('*')
        .gte('fetched_at', startUTC)
        .lte('fetched_at', endUTC)
        .order('published_at', { ascending: false })

      if (todayNews) setArticles(todayNews)

      // 2. 그래프 데이터 (최근 7일)
      // 7일 전 UTC 시작 시간 계산
      const sevenDaysAgoTimestamp = startTimestamp - (6 * 24 * 60 * 60 * 1000)
      const sevenDaysAgoUTC = new Date(sevenDaysAgoTimestamp).toISOString()

      const { data: statsRaw } = await supabase
        .from('news_articles')
        .select('fetched_at')
        .gte('fetched_at', sevenDaysAgoUTC)
        .lte('fetched_at', endUTC)

      // 날짜별 그룹핑
      const dailyCounts: Record<string, number> = {}
      
      // 7일치 키 초기화
      for (let i = 0; i < 7; i++) {
        const d = new Date(startTimestamp - ((6 - i) * 24 * 60 * 60 * 1000))
        // UTC 시간을 다시 한국 날짜 문자열로 변환 (표시용)
        const kstD = new Date(d.getTime() + kstOffset)
        const dateKey = kstD.toISOString().split('T')[0]
        dailyCounts[dateKey] = 0
      }

      if (statsRaw) {
        statsRaw.forEach((item: any) => {
          // DB 시간(UTC) -> 한국 시간 변환 후 카운트
          const itemKST = new Date(new Date(item.fetched_at).getTime() + kstOffset)
          const dateKey = itemKST.toISOString().split('T')[0]
          if (dailyCounts[dateKey] !== undefined) dailyCounts[dateKey]++
        })
      }

      const chartArr = Object.keys(dailyCounts).map(dateKey => ({
        date: dateKey.slice(5), // "12-29"
        fullDate: dateKey,
        count: dailyCounts[dateKey],
        isToday: dateKey === dateParam
      }))

      setChartData(chartArr)
      setLoading(false)
    }

    fetchData()
  }, [dateParam, supabase])

  if (!dateParam) {
    return <div className="p-10 text-center text-gray-500">잘못된 접근입니다.</div>
  }

  return (
    <div className="min-h-screen bg-orange-50/30 pb-10 font-sans">
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        
        {/* 헤더 */}
        <header className="mb-6 bg-white p-6 rounded-2xl shadow-sm border border-orange-100">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-bold">{dateParam}</span>
            <span>뉴스 브리핑</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            📰 <span className="text-orange-600">오늘의 뉴스</span> 리포트
          </h1>
        </header>

        {/* 검색 필터 (하이라이트용) */}
        <div className="mb-6 flex gap-2">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                    type="text" 
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="결과 내 검색 (강조할 단어)"
                    className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm shadow-sm"
                />
            </div>
        </div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-40 bg-white rounded-2xl" />
            <div className="h-24 bg-white rounded-xl" />
            <div className="h-24 bg-white rounded-xl" />
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* 1. 주간 트렌드 차트 */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-bold text-gray-800">최근 7일 기사량</h2>
              </div>
              
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis 
                      dataKey="date" 
                      tick={{fontSize: 12, fill: '#666'}} 
                      axisLine={false} 
                      tickLine={false} 
                    />
                    <Tooltip 
                      cursor={{fill: '#fff7ed'}}
                      contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.isToday ? '#ea580c' : '#fdba74'} // 오늘은 진한 주황, 나머지는 연한 주황
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* 2. 뉴스 리스트 */}
            <section>
              <div className="flex items-center justify-between mb-3 px-2">
                <div className="flex items-center gap-2">
                    <Newspaper className="w-5 h-5 text-gray-500" />
                    <h2 className="text-lg font-bold text-gray-800">뉴스 목록 ({articles.length})</h2>
                </div>
              </div>

              {articles.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300 text-gray-400">
                  오늘 수집된 뉴스가 없습니다.
                </div>
              ) : (
                <div className="grid gap-3">
                  {articles.map((item) => (
                    <a 
                      key={item.id} 
                      href={item.source_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block p-5 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md hover:border-orange-300 transition group"
                    >
                      <h3 className="text-base font-bold text-gray-800 group-hover:text-orange-600 mb-2 line-clamp-2 leading-snug">
                        <HighlightText text={item.title} keyword={keyword} />
                      </h3>
                      <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                        {item.content ? (
                           <HighlightText text={item.content.replace(/<[^>]*>?/gm, '')} keyword={keyword} />
                        ) : ''}
                      </p>
                      <div className="flex justify-between items-center text-xs text-gray-400 border-t border-gray-50 pt-3 mt-1">
                        <span className="bg-gray-100 px-2 py-1 rounded text-gray-500 font-medium">
                          {item.publisher || '네이버 뉴스'}
                        </span>
                        <span>
                          {new Date(item.published_at || item.fetched_at).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}