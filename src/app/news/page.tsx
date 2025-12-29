//src\app\news\page.tsx
'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import {
  ExternalLink, RefreshCcw, Search, FilterX, LineChart as LineChartIcon, X as XIcon, Calendar as CalendarIcon, Info
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LabelList,
} from 'recharts'

type NewsRow = {
  id: string
  title: string
  content?: string | null
  snippet?: string
  publisher: string | null
  source_url: string
  published_at: string | null
  fetched_at: string | null
}

type ListResp = { ok: boolean; list: NewsRow[]; publishers: string[] }

type TrendPoint = {
  date: string
  total: number
  [keyword: string]: string | number
}

type TrendResp = {
  ok: boolean
  days: number
  terms: string[]
  series: TrendPoint[]
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

// ✅ [수정 1] 날짜 그룹핑을 '무조건 한국 시간(KST)' 기준으로 통일
// 기존: 로컬 시간 기준 -> 사용자에 따라 날짜가 밀릴 수 있음
// 변경: UTC 시간에 9시간을 더해 날짜를 계산하여 서버 통계와 싱크를 맞춤
function getKSTDateString(dateISO: string | null) {
    if (!dateISO) return ''
    const date = new Date(dateISO);
    // UTC 타임스탬프 + 9시간 (KST)
    const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    // YYYY-MM-DD 형식 반환
    return kstDate.toISOString().split('T')[0];
}

function hhmm(dateISO: string | null) {
  if (!dateISO) return ''
  const d = new Date(dateISO)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function decodeHtmlEntities(input?: string | null): string {
  if (!input) return ''
  let s = String(input)
  s = s.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
  const map: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
    '&apos;': "'", '&nbsp;': ' ', '&ldquo;': '“', '&rdquo;': '”',
    '&lsquo;': '‘', '&rsquo;': '’', '&hellip;': '…', '&middot;': '·',
  }
  s = s.replace(/&[a-zA-Z]+?;|&#\d+;|&#x[0-9a-fA-F]+;/g, (m) => map[m] ?? m)
  return s
}

function topicBadge(countInput: unknown) {
  const n = typeof countInput === 'number' ? countInput : 0
  if (n >= 20) return { label: '🔥 High', cls: 'bg-red-100 text-red-700 border-red-200' }
  if (n >= 10) return { label: '⚡ Medium', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' }
  return { label: '🌱 Low', cls: 'bg-green-100 text-green-700 border-green-200' }
}

function highlight(text: string, terms: string[]) {
  if (!text || terms.length === 0) return text
  const escaped = terms.map((t) => t.trim()).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (escaped.length === 0) return text
  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(re)
  return parts.map((part, i) =>
    re.test(part) ? <mark key={`m-${i}`} className="bg-yellow-200 rounded px-0.5">{part}</mark> : <span key={`t-${i}`}>{part}</span>
  )
}

function CustomTooltip(props: any) {
  const { active, payload } = props
  if (!active || !payload || payload.length === 0) return null

  const first = payload[0]
  const dateLabel = first?.payload?.date ?? ''
  const totalItem = payload.find((p: any) => p.dataKey === 'total')
  const termItems = payload.filter((p: any) => p.dataKey !== 'total')

  return (
    <div className="rounded-lg border bg-white p-3 shadow-lg max-w-[80vw]" style={{ pointerEvents: 'none' }}>
      <div className="text-sm font-semibold text-gray-800 mb-2 border-b pb-1">{String(dateLabel)}</div>
      
      {/* Total은 항상 표시 */}
      {typeof totalItem?.value !== 'undefined' && (
        <div className="flex items-center gap-2 text-sm mb-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-orange-200" />
          <span className="text-gray-600">전체 발행량</span>
          <span className="ml-auto font-bold text-gray-900">{totalItem.value}건</span>
        </div>
      )}

      {/* 키워드 검색 결과 */}
      {termItems.map((it: any) => (
        <div key={String(it.dataKey)} className="flex items-center gap-2 text-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
          <span className="truncate text-gray-600 font-medium">"{String(it.dataKey)}" 포함</span>
          <span className="ml-auto font-bold text-orange-600">{it.value}건</span>
        </div>
      ))}
    </div>
  )
}

export default function NewsPage() {
  const [days, setDays] = useState<1 | 3 | 7>(3)
  const [selectedDate, setSelectedDate] = useState<string>('') 
  type TrendDays = 7 | 14 | 30
  const [trendDays, setTrendDays] = useState<TrendDays>(7)

  const [query, setQuery] = useState('')
  const [selectedPublishers, setSelectedPublishers] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [showPublishers, setShowPublishers] = useState(false)

  const listKey = useMemo(() => {
    return selectedDate
      ? `/api/news/list?date=${encodeURIComponent(selectedDate)}`
      : `/api/news/list?days=${days}`
  }, [selectedDate, days])

  const { data, isLoading, mutate } = useSWR<ListResp>(listKey, fetcher, {
    refreshInterval: 0, revalidateOnFocus: false,
  })
  const listRaw = useMemo(() => (data?.ok ? data.list : []), [data])
  const allPublishers = useMemo(() => data?.publishers ?? [], [data])

  const trendTerms = useMemo(() => query.split(',').map(s => s.trim()).filter(Boolean), [query])
  const trendKey = useMemo(
    () => `/api/news/trend?days=${trendDays}&terms=${encodeURIComponent(trendTerms.join(','))}`,
    [trendDays, trendTerms]
  )
  const { data: trend } = useSWR<TrendResp>(trendKey, fetcher, { refreshInterval: 0, revalidateOnFocus: false })

  const filtered = useMemo(() => {
    const qs = query.split(',').join(' ').split(/\s+/).map(s => s.trim()).filter(Boolean)
    const hasPublisherFilter = selectedPublishers.length > 0

    return listRaw.filter((n) => {
      if (hasPublisherFilter) {
        const p = n.publisher || 'Unknown'
        if (!selectedPublishers.includes(p)) return false
      }
      if (qs.length > 0) {
        const title = decodeHtmlEntities(n.title)
        const snippet = decodeHtmlEntities(n.snippet)
        const hay = `${title} ${snippet} ${n.publisher || ''}`.toLowerCase()
        for (const term of qs) {
          if (!hay.includes(term.toLowerCase())) return false
        }
      }
      return true
    })
  }, [listRaw, query, selectedPublishers])

  // ✅ [수정 2] 그룹핑 로직에 KST 날짜 함수 적용
  const grouped = useMemo(() => {
    const map = new Map<string, NewsRow[]>()
    for (const n of filtered) {
      // getKSTDateString 사용으로 날짜 밀림 현상 방지
      const key = getKSTDateString(n.published_at || n.fetched_at)
      const arr = map.get(key) || []
      arr.push(n)
      map.set(key, arr)
    }
    // 날짜 내림차순 정렬
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  const queryTerms = useMemo(() => query.split(',').join(' ').split(/\s+/).map(s => s.trim()).filter(Boolean), [query])

  const togglePublisher = (name: string) => {
    setSelectedPublishers((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name])
  }

  const clearFilters = () => {
    setSelectedPublishers([])
    setQuery('')
  }

  const clearDate = () => setSelectedDate('')

  const manualIngest = async () => {
    setNotice(null)
    const before = await fetch('/api/news/debug-count', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}))
    const beforeCount = before?.count ? Number(before.count) : 0

    await fetch('/api/news/fetch', { cache: 'no-store' })
    
    const after = await fetch('/api/news/debug-count', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}))
    const afterCount = after?.count ? Number(after.count) : 0
    const delta = afterCount - beforeCount

    setNotice(`수집 완료: ${delta > 0 ? `${delta}건의 새로운 기사를 가져왔습니다.` : '새로운 기사가 없습니다.'}`)
    mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">News</h1>
          <p className="text-sm text-gray-500 mt-1">한화투자증권 관련 뉴스 모니터링</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center rounded-lg border bg-white overflow-hidden">
            {[1, 3, 7].map(d => (
              <button
                key={d}
                className={`px-3 py-1.5 text-sm ${days === d ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                onClick={() => setDays(d as any)}
                disabled={!!selectedDate}
              >
                {d}일
              </button>
            ))}
          </div>
          
          <div className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5">
            <CalendarIcon className="h-4 w-4 text-gray-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm outline-none bg-transparent"
            />
            {selectedDate && <button onClick={clearDate}><XIcon className="h-4 w-4 text-gray-500" /></button>}
          </div>

          <button onClick={() => mutate()} className="btn-white"><RefreshCcw className="h-4 w-4" /></button>
          <button onClick={manualIngest} className="btn-white">수동 수집</button>
        </div>
      </div>

      {notice && <div className="rounded-lg border bg-white p-3 text-sm text-gray-800 shadow-sm">{notice}</div>}

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <label className="flex items-center gap-2 flex-1">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색어 입력 (예: 실적, 목표주가)"
              className="flex-1 outline-none bg-transparent text-sm"
            />
          </label>
          <button onClick={() => setShowPublishers(v => !v)} className="btn-white text-xs">{showPublishers ? '언론사 접기' : '언론사 필터'}</button>
          <button onClick={clearFilters} className="btn-white text-xs"><FilterX className="h-4 w-4" /> 초기화</button>
        </div>

        {showPublishers && (
          <div className="mt-3 flex flex-wrap gap-2">
            {allPublishers.map((p) => (
              <button
                key={p}
                onClick={() => togglePublisher(p)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${selectedPublishers.includes(p) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'}`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
             <LineChartIcon className="h-4 w-4 text-gray-600" />
             <h2 className="text-lg font-semibold">일별 트렌드</h2>
             {/* ✅ [수정 3] 사용자가 혼동하지 않도록 안내 툴팁 추가 */}
             <div className="group relative">
                <Info className="w-4 h-4 text-gray-400 cursor-help" />
                <div className="absolute left-0 bottom-6 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg hidden group-hover:block z-10">
                    막대(Total)는 검색어와 무관한 전체 기사 수입니다.<br/>
                    검색어에 해당하는 수는 꺾은선(Line)을 참고하세요.
                </div>
             </div>
          </div>
          <div className="flex gap-1">
             {[7, 14, 30].map(d => (
                 <button key={d} onClick={() => setTrendDays(d as any)} className={`px-2 py-1 text-xs rounded border ${trendDays === d ? 'bg-gray-100 font-bold' : 'bg-white'}`}>{d}일</button>
             ))}
          </div>
        </div>

        <div className="w-full h-[280px]">
          <ResponsiveContainer>
            <ComposedChart data={trend?.series || []} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{fontSize: 12}} />
              <YAxis allowDecimals={false} tick={{fontSize: 12}} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{fontSize: '12px'}} />
              
              {/* 전체 기사 수 (막대) */}
              <Bar dataKey="total" name="전체 발행량" fill="#fed7aa" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="total" position="top" style={{ fill: '#9ca3af', fontSize: 10 }} />
              </Bar>

              {/* 검색어 트렌드 (선) */}
              {(trend?.terms || []).map((t, idx) => (
                <Line
                  key={t}
                  type="monotone"
                  dataKey={t}
                  name={`"${t}" 포함`}
                  stroke={['#ea580c', '#db2777', '#7c3aed'][idx % 3]} // 색상 순환
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 리스트 영역 */}
      {grouped.map(([date, items]) => (
        <section key={date} className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">{date}</h2>
            <span className={`px-2 py-0.5 rounded-full text-xs ${topicBadge(items.length).cls}`}>
              {items.length}건
            </span>
          </div>
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id} className="py-3">
                <Link href={n.source_url} target="_blank" className="font-medium hover:text-orange-600 block mb-1">
                    {highlight(decodeHtmlEntities(n.title), queryTerms)}
                    <ExternalLink className="inline ml-1 h-3 w-3 text-gray-400" />
                </Link>
                <div className="text-xs text-gray-500 mb-1">
                    {n.publisher || 'Unknown'} · {hhmm(n.published_at || n.fetched_at)}
                </div>
                {n.snippet && <p className="text-sm text-gray-600 line-clamp-2">{highlight(decodeHtmlEntities(n.snippet), queryTerms)}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      
      {!isLoading && grouped.length === 0 && (
         <div className="text-center py-10 text-gray-500 bg-white rounded-xl border border-dashed">표시할 뉴스가 없습니다.</div>
      )}
      
      <style jsx>{`
        .btn-white { @apply inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50; }
      `}</style>
    </div>
  )
}