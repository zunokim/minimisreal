// src/app/news/daily-summary/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { CalendarDays, Newspaper } from 'lucide-react'

// 서스펜스 (Next.js 빌드용)
export default function DailySummaryPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center">데이터를 불러오는 중...</div>}>
      <SummaryContent />
    </Suspense>
  )
}

function SummaryContent() {
  const searchParams = useSearchParams()
  const keyword = searchParams.get('keyword') || ''
  const dateParam = searchParams.get('date') || ''
  
  const [articles, setArticles] = useState<any[]>([])
  const [chartData, setChartData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    if (!keyword || !dateParam) return

    const fetchData = async () => {
      setLoading(true)

      // 1. 오늘의 뉴스 가져오기
      const startDate = `${dateParam}T00:00:00`
      const endDate = `${dateParam}T23:59:59`

      const { data: todayNews } = await supabase
        .from('news_articles')
        .select('*')
        .ilike('title', `%${keyword}%`)
        .gte('fetched_at', startDate)
        .lte('fetched_at', endDate)
        .order('published_at', { ascending: false })

      if (todayNews) setArticles(todayNews)

      // 2. 최근 7일간 통계 데이터 만들기
      // 오늘 기준으로 7일 전 날짜 계산
      const endObj = new Date(dateParam)
      const startObj = new Date(endObj)
      startObj.setDate(endObj.getDate() - 6) // 7일간 (오늘 포함)

      const startStatStr = startObj.toISOString().split('T')[0]
      const endStatStr = `${dateParam}T23:59:59`

      // 날짜별 개수를 세기 위해 해당 기간의 'fetched_at'만 가져옴
      const { data: statsRaw } = await supabase
        .from('news_articles')
        .select('fetched_at')
        .ilike('title', `%${keyword}%`)
        .gte('fetched_at', `${startStatStr}T00:00:00`)
        .lte('fetched_at', endStatStr)

      // 날짜별 그룹핑 로직
      const dailyCounts: Record<string, number> = {}
      
      // 초기화 (0건인 날짜도 표시하기 위해)
      for (let d = new Date(startObj); d <= endObj; d.setDate(d.getDate() + 1)) {
        // 한국 시간 보정 (간단하게 문자열 처리)
        const dStr = d.toISOString().split('T')[0]
        dailyCounts[dStr] = 0
      }

      // 카운팅
      if (statsRaw) {
        statsRaw.forEach((item: any) => {
          // DB 시간이 UTC일 수 있으므로 한국 시간으로 변환 후 카운트
          const kstDate = new Date(new Date(item.fetched_at).getTime() + (9 * 60 * 60 * 1000))
          const dateKey = kstDate.toISOString().split('T')[0]
          
          if (dailyCounts[dateKey] !== undefined) {
            dailyCounts[dateKey]++
          }
        })
      }

      // 차트용 배열로 변환
      const chartArr = Object.keys(dailyCounts).map(dateKey => ({
        date: dateKey.slice(5), // "12-26" 형태로 자름
        fullDate: dateKey,
        count: dailyCounts[dateKey],
        isToday: dateKey === dateParam // 오늘 날짜 표시용
      }))

      setChartData(chartArr)
      setLoading(false)
    }

    fetchData()
  }, [keyword, dateParam, supabase])

  if (!keyword || !dateParam) {
    return <div className="p-10 text-center text-gray-500">잘못된 접근입니다.</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        
        {/* 헤더 */}
        <header className="mb-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">{dateParam}</span>
            <span>일일 브리핑</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            📰 <span className="text-blue-600">{keyword}</span> 뉴스 리포트
          </h1>
        </header>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-40 bg-gray-200 rounded-2xl" />
            <div className="h-24 bg-gray-200 rounded-xl" />
            <div className="h-24 bg-gray-200 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* 1. 주간 트렌드 차트 */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-bold text-gray-800">최근 7일 기사량 추이</h2>
              </div>
              
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis 
                      dataKey="date" 
                      tick={{fontSize: 12}} 
                      axisLine={false} 
                      tickLine={false} 
                    />
                    <Tooltip 
                      cursor={{fill: '#f3f4f6'}}
                      contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.isToday ? '#2563eb' : '#cbd5e1'} // 오늘은 파란색, 나머지는 회색
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-center text-gray-400 mt-2">
                * 오늘은 <span className="text-blue-600 font-bold">{articles.length}건</span>의 뉴스가 수집되었습니다.
              </p>
            </section>

            {/* 2. 뉴스 리스트 */}
            <section>
              <div className="flex items-center gap-2 mb-3 px-2">
                <Newspaper className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-bold text-gray-800">오늘의 뉴스 ({articles.length})</h2>
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
                      className="block p-5 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md hover:border-blue-300 transition group"
                    >
                      <h3 className="text-base font-bold text-gray-800 group-hover:text-blue-600 mb-2 line-clamp-2 leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                        {item.content ? item.content.replace(/<[^>]*>?/gm, '') : ''}
                      </p>
                      <div className="flex justify-between items-center text-xs text-gray-400 border-t border-gray-50 pt-3 mt-1">
                        <span className="bg-gray-100 px-2 py-1 rounded text-gray-500 font-medium">
                          {item.publisher || '뉴스'}
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