// src/app/news/daily-summary/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { CalendarDays, Newspaper, Search, Beaker, Calendar, ChevronDown, ChevronUp, Copy } from 'lucide-react'

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
    return cleaned.trim(); // 공백 제거 추가
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

// [변경] 기사 그룹핑 함수 (제목 기준)
const groupArticlesByTitle = (articles: any[]) => {
    const groups: Record<string, any[]> = {};
    
    articles.forEach(item => {
        // 제목을 정제해서 키로 사용 (공백, 특수문자 차이 제거)
        const key = cleanText(item.title);
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(item);
    });

    // 각 그룹을 배열로 변환하고, 그룹 내에서도 최신순 정렬 유지
    return Object.values(groups);
}


// [변경] 기사 카드 컴포넌트 (배열을 받음)
const ArticleCard = ({ articles, keyword }: { articles: any[], keyword: string }) => {
    // 그룹 중 가장 최신 기사를 대표로 표시
    const mainItem = articles[0]; 
    const duplicateCount = articles.length - 1; // 중복 개수

    const titleText = cleanText(mainItem.title);
    const contentText = cleanText(mainItem.content);

    return (
        <a 
          href={mainItem.source_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="block p-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-orange-200 transition-all group relative overflow-hidden"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="text-[17px] font-bold text-gray-800 group-hover:text-orange-700 leading-snug break-keep flex-1">
              <HighlightText text={titleText} keyword={keyword} />
            </h3>

            {/* [추가] 중복 기사 뱃지 */}
            {duplicateCount > 0 && (
                <span className="shrink-0 flex items-center gap-1 bg-gray-100 text-gray-500 text-[11px] px-2 py-1 rounded-md font-bold self-start mt-1" title="동일한 제목의 기사가 더 있습니다.">
                    <Copy className="w-3 h-3" /> +{duplicateCount}
                </span>
            )}
          </div>
          
          <p className="text-sm text-gray-500 line-clamp-2 mb-4 leading-relaxed">
            {contentText ? (
               <HighlightText text={contentText} keyword={keyword} />
            ) : '내용 없음'}
          </p>
          
          <div className="flex justify-between items-center text-xs text-gray-400 border-t border-gray-50 pt-3 mt-1">
            <div className="flex items-center gap-2">
                <span className="bg-gray-50 text-gray-500 px-2 py-1 rounded-md font-medium flex items-center gap-1">
                {mainItem.publisher || '네이버 뉴스'}
                </span>
                {/* 중복이 있다면 안내 문구 */}
                {duplicateCount > 0 && (
                    <span className="text-gray-300">외 {duplicateCount}개 매체</span>
                )}
            </div>
            <span className="font-medium">
                {new Date(mainItem.published_at).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})}
            </span>
          </div>
        </a>
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
  const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0]
  
  const [keyword, setKeyword] = useState('한화') 
  
  // [변경] 기사 그룹 배열 (any[][])
  const [generalGroups, setGeneralGroups] = useState<any[][]>([])
  const [researchGroups, setResearchGroups] = useState<any[][]>([])
  
  const [chartData, setChartData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isResearchOpen, setIsResearchOpen] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (newDate) router.push(`?date=${newDate}`);
  }

  useEffect(() => {
    if (!dateParam) return

    const fetchData = async () => {
      setLoading(true)

      const targetDate = new Date(dateParam)
      const startISO = `${dateParam}T00:00:00+09:00`
      const endISO = `${dateParam}T23:59:59+09:00`

      // 1. 오늘의 모든 뉴스 가져오기
      const { data: todayNews } = await supabase
        .from('news_articles')
        .select('*')
        .gte('published_at', startISO)
        .lte('published_at', endISO)
        .order('published_at', { ascending: false })

      if (todayNews) {
        // [1] 제목 기준으로 먼저 그룹핑
        const groupedArticles = groupArticlesByTitle(todayNews);

        // [2] 그룹별로 일반/리서치 분류
        const general: any[][] = [];
        const research: any[][] = [];

        groupedArticles.forEach((group) => {
            // 그룹 내 대표 기사(첫번째)로 판단
            const mainItem = group[0];
            const rawText = (mainItem.title + mainItem.content).toLowerCase();
            
            if (rawText.includes('연구원') || rawText.includes('애널리스트')) {
                research.push(group);
            } else {
                general.push(group);
            }
        });

        setGeneralGroups(general);
        setResearchGroups(research);
      }

      // 2. 그래프 데이터
      const endDateObj = new Date(dateParam);
      const startDateObj = new Date(endDateObj);
      startDateObj.setDate(endDateObj.getDate() - 6);
      
      const startStatISO = `${startDateObj.toISOString().split('T')[0]}T00:00:00+09:00`

      const { data: statsRaw } = await supabase
        .from('news_articles')
        .select('published_at')
        .gte('published_at', startStatISO)
        .lte('published_at', endISO)

      const dailyCounts: Record<string, number> = {}
      for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
         const dateKey = d.toISOString().split('T')[0];
         dailyCounts[dateKey] = 0;
      }

      if (statsRaw) {
        statsRaw.forEach((item: any) => {
          const pDate = new Date(item.published_at);
          const kstDate = new Date(pDate.getTime() + (9 * 60 * 60 * 1000));
          const dateKey = kstDate.toISOString().split('T')[0];
          if (dailyCounts[dateKey] !== undefined) dailyCounts[dateKey]++
        })
      }

      const chartArr = Object.keys(dailyCounts).map(dateKey => ({
        date: dateKey.slice(5),
        fullDate: dateKey,
        count: dailyCounts[dateKey],
        isToday: dateKey === dateParam
      }))

      setChartData(chartArr)
      setLoading(false)
    }

    fetchData()
  }, [dateParam, supabase])

  // 전체 기사 수 계산 (그룹 개수가 아니라 실제 기사 총 개수)
  const totalArticlesCount = generalGroups.reduce((acc, g) => acc + g.length, 0) + researchGroups.reduce((acc, g) => acc + g.length, 0);

  return (
    <div className="min-h-screen bg-orange-50/50 pb-20">
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
                    placeholder="결과 내 검색"
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
          <div className="space-y-8">
            
            {/* 1. 주간 트렌드 차트 */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100/50">
              <div className="flex items-center gap-2 mb-5">
                <CalendarDays className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-bold text-gray-800">
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

            {/* 2. 일반 기사 섹션 */}
            <section>
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                    <Newspaper className="w-5 h-5 text-orange-600" />
                    <h2 className="text-lg font-bold text-gray-800">
                        일반 기사 <span className="text-gray-500 text-sm font-medium">({generalGroups.length}건)</span>
                    </h2>
                </div>
              </div>

              {generalGroups.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border-2 border-dashed border-gray-200 text-gray-400">
                  <p>일반 기사가 없습니다.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {generalGroups.map((group, idx) => (
                    <ArticleCard key={idx} articles={group} keyword={keyword} />
                  ))}
                </div>
              )}
            </section>

            {/* 3. 리서치 리포트 관련 섹션 (접이식) */}
            <section className="mt-8">
                <button 
                    onClick={() => setIsResearchOpen(!isResearchOpen)}
                    className="w-full flex items-center justify-between bg-purple-50 p-4 rounded-xl border border-purple-100 hover:bg-purple-100 transition-colors group"
                >
                    <div className="flex items-center gap-2">
                        <Beaker className="w-5 h-5 text-purple-600" />
                        <h2 className="text-lg font-bold text-gray-800">
                            리서치 리포트 관련 <span className="text-purple-600 text-sm font-bold">({researchGroups.length}건)</span>
                        </h2>
                    </div>
                    {isResearchOpen ? (
                        <ChevronUp className="w-5 h-5 text-purple-400 group-hover:text-purple-600" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-purple-400 group-hover:text-purple-600" />
                    )}
                </button>

                {isResearchOpen && (
                    <div className="mt-4 grid gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        {researchGroups.length === 0 ? (
                             <div className="text-center py-8 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400 text-sm">
                                <p>관련 리포트 기사가 없습니다.</p>
                             </div>
                        ) : (
                            researchGroups.map((group, idx) => (
                                <ArticleCard key={idx} articles={group} keyword={keyword} />
                            ))
                        )}
                    </div>
                )}
            </section>

            {/* 푸터 */}
            <footer className="text-center text-xs text-gray-400 mt-10 pb-4">
                Total Collected Articles: {totalArticlesCount}
            </footer>

          </div>
        )}
      </div>
    </div>
  )
}