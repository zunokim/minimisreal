// src/app/news/daily-summary/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { CalendarDays, Newspaper, Search, Beaker, Calendar } from 'lucide-react'

// HTML 정리 함수
const cleanText = (text: string | null) => {
    if (!text) return '';
    let cleaned = text.replace(/<[^>]*>?/gm, '');
    cleaned = cleaned
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#039;/gi, "'")
        .replace(/&#39;/gi, "'");
    return cleaned;
}

// 하이라이팅 컴포넌트
const HighlightText = ({ text, keyword }: { text: string, keyword: string }) => {
  if (!keyword || !text) return <>{text}</>
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedKeyword})`, 'gi'))
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === keyword.toLowerCase() ? (
          <span key={i} className="bg-orange-100 text-orange-700 font-bold px-0.5 rounded">
            {part}
          </span>
        ) : ( part )
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0] // 없으면 오늘 날짜
  
  const [keyword, setKeyword] = useState('한화') 
  const [articles, setArticles] = useState<any[]>([])
  const [chartData, setChartData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 날짜 변경 핸들러
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (newDate) {
        // URL 쿼리 파라미터 업데이트 -> useEffect가 감지해서 다시 로딩함
        router.push(`?date=${newDate}`);
    }
  }

  useEffect(() => {
    if (!dateParam) return

    const fetchData = async () => {
      setLoading(true)

      // [변경] published_at 기준으로 KST 하루 범위 계산
      const targetDate = new Date(dateParam)
      
      // 한국 시간(KST) 기준 00:00:00 ~ 23:59:59 문자열 생성 (ISO 포맷에 타임존 오프셋 포함)
      // 예: 2025-12-29T00:00:00+09:00
      const startISO = `${dateParam}T00:00:00+09:00`
      const endISO = `${dateParam}T23:59:59+09:00`

      // 1. 오늘의 뉴스 가져오기 (published_at 기준)
      const { data: todayNews } = await supabase
        .from('news_articles')
        .select('*')
        .gte('published_at', startISO) // [변경] fetched_at -> published_at
        .lte('published_at', endISO)   // [변경] fetched_at -> published_at
        .order('published_at', { ascending: false })

      if (todayNews) setArticles(todayNews)

      // 2. 그래프 데이터 (최근 7일, published_at 기준)
      // 7일 전 날짜 계산
      const endDateObj = new Date(dateParam);
      const startDateObj = new Date(endDateObj);
      startDateObj.setDate(endDateObj.getDate() - 6);
      
      const startStatISO = `${startDateObj.toISOString().split('T')[0]}T00:00:00+09:00`

      const { data: statsRaw } = await supabase
        .from('news_articles')
        .select('published_at') // [변경] fetched_at -> published_at
        .gte('published_at', startStatISO)
        .lte('published_at', endISO)

      // 날짜별 그룹핑
      const dailyCounts: Record<string, number> = {}
      
      // 7일치 0으로 초기화
      for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
         const dateKey = d.toISOString().split('T')[0];
         dailyCounts[dateKey] = 0;
      }

      if (statsRaw) {
        statsRaw.forEach((item: any) => {
          // published_at은 ISO String이므로, 날짜 부분(YYYY-MM-DD)만 자르면 됨
          // 단, KST 보정을 위해 Date 객체로 변환 후 처리
          const pDate = new Date(item.published_at);
          // UTC 시간 -> KST 날짜 문자열 변환
          const kstDate = new Date(pDate.getTime() + (9 * 60 * 60 * 1000));
          const dateKey = kstDate.toISOString().split('T')[0];
          
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

  return (
    // [변경] font-sans 제거 -> 기본 폰트(리디바탕) 상속
    <div className="min-h-screen bg-orange-50/50 pb-10">
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        
        {/* 헤더 & 날짜 선택 */}
        <header className="mb-6 bg-white p-6 rounded-2xl shadow-sm border border-orange-100 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <span className="bg-orange-100 text-orange-700 px-2.5 py-0.5 rounded-full font-bold">Daily Briefing</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              📰 <span className="text-orange-600">뉴스 리포트</span>
            </h1>
          </div>

          {/* 날짜 선택기 */}
          <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200">
            <Calendar className="w-5 h-5 text-gray-400 ml-1" />
            <input 
                type="date"
                value={dateParam}
                onChange={handleDateChange}
                className="bg-transparent border-none text-gray-700 font-bold focus:ring-0 outline-none cursor-pointer"
            />
          </div>
        </header>

        {/* 검색 필터 */}
        <div className="mb-6 flex gap-2 sticky top-4 z-10 shadow-sm rounded-xl bg-white">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                    type="text" 
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="결과 내 검색 (예: 실적, 연구원)"
                    className="w-full pl-10 pr-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm transition-all bg-transparent"
                />
            </div>
        </div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-48 bg-white rounded-2xl shadow-sm" />
            <div className="h-32 bg-white rounded-xl shadow-sm" />
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* 1. 주간 트렌드 차트 */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100/50">
              <div className="flex items-center gap-2 mb-5">
                <CalendarDays className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-bold text-gray-800">
                   {/* 선택된 날짜 기준 최근 7일 */}
                   최근 7일 추이 <span className="text-xs font-normal text-gray-400">({chartData[0]?.date} ~ {chartData[6]?.date})</span>
                </h2>
              </div>
              
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{fontSize: 11, fill: '#9ca3af', fontWeight: 500}} axisLine={false} tickLine={false} dy={10} />
                    <Tooltip 
                      cursor={{fill: '#fff7ed', opacity: 0.5}}
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '8px 12px'}}
                      labelStyle={{color: '#6b7280', fontSize: '0.8rem', marginBottom: '4px'}}
                      itemStyle={{color: '#ea580c', fontWeight: 'bold', fontSize: '0.9rem'}}
                      formatter={(value) => [`${value}건`, '기사 수']}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={50}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.isToday ? 'url(#colorToday)' : '#fdba74'} className="transition-all duration-300 hover:opacity-80"/>
                      ))}
                    </Bar>
                    <defs>
                      <linearGradient id="colorToday" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ea580c" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#f97316" stopOpacity={0.8}/>
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* 2. 뉴스 리스트 */}
            <section>
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                    <Newspaper className="w-5 h-5 text-orange-600" />
                    <h2 className="text-lg font-bold text-gray-800">
                        뉴스 목록 <span className="text-gray-500 text-sm font-medium">({articles.length})</span>
                    </h2>
                </div>
              </div>

              {articles.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400">
                  <Newspaper className="w-10 h-10 mb-3 text-gray-300" strokeWidth={1.5} />
                  <p>선택한 날짜에 수집된 뉴스가 없습니다.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {articles.map((item) => {
                    const titleText = cleanText(item.title);
                    const contentText = cleanText(item.content);
                    const isResearchRelated = titleText.includes('연구원') || contentText.includes('연구원');

                    return (
                    <a 
                      key={item.id} 
                      href={item.source_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block p-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-orange-200 transition-all group relative overflow-hidden"
                    >
                      {/* [변경] 제목 영역 레이아웃 수정: justify-between으로 라벨 오른쪽 끝 배치 */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="text-[17px] font-bold text-gray-800 group-hover:text-orange-700 leading-snug break-keep">
                          <HighlightText text={titleText} keyword={keyword} />
                        </h3>
                        
                        {/* 리서치 라벨 (오른쪽 고정, 줄바꿈 방지) */}
                        {isResearchRelated && (
                          <span className="shrink-0 flex items-center gap-1 bg-purple-100 text-purple-700 text-[11px] px-2 py-0.5 rounded-md font-bold self-start mt-1">
                            <Beaker className="w-3 h-3" /> 리서치
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-500 line-clamp-2 mb-4 leading-relaxed">
                        {contentText ? (
                           <HighlightText text={contentText} keyword={keyword} />
                        ) : '내용 없음'}
                      </p>
                      
                      <div className="flex justify-between items-center text-xs text-gray-400 border-t border-gray-50 pt-3 mt-1">
                        <span className="bg-gray-50 text-gray-500 px-2 py-1 rounded-md font-medium flex items-center gap-1">
                          {item.publisher || '네이버 뉴스'}
                        </span>
                        <span className="font-medium">
                            {/* published_at 기준 시간 표시 */}
                            {new Date(item.published_at).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                    </a>
                  )})}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}