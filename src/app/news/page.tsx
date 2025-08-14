'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import {
  ExternalLink, RefreshCcw, Search, FilterX, LineChart as LineChartIcon
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
import type { TooltipProps } from 'recharts'

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
type TrendResp = {
  ok: boolean
  days: number
  terms: string[]
  series: Array<Record<string, number | string>>
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function ymd(dateISO: string | null) {
  if (!dateISO) return ''
  const d = new Date(dateISO)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function hhmm(dateISO: string | null) {
  if (!dateISO) return ''
  const d = new Date(dateISO)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

// 방어적인 배지 계산
function topicBadge(countInput: unknown) {
  const n = typeof countInput === 'number' ? countInput : 0
  if (n >= 20) return { label: '🔥 High', cls: 'bg-red-100 text-red-700 border-red-200' }
  if (n >= 10) return { label: '⚡ Medium', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' }
  return { label: '🌱 Low', cls: 'bg-green-100 text-green-700 border-green-200' }
}

// 키워드 하이라이트
function highlight(text: string, terms: string[]) {
  if (!text || terms.length === 0) return text
  const escaped = terms
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (escaped.length === 0) return text

  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(re)
  return parts.map((part, i) =>
    re.test(part) ? (
      <mark key={`m-${i}`} className="bg-yellow-200 rounded px-0.5">
        {part}
      </mark>
    ) : (
      <span key={`t-${i}`}>{part}</span>
    )
  )
}

/** 모바일 친화 툴팁 */
function CustomTooltip({
  active,
  label,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null

  // payload: [{ dataKey: 'total', value: 12, color: ..., ... }, { dataKey: '한화투자증권', value: 7, ... }, ...]
  // total 우선, 그 뒤 키워드들
  const totalItem = payload.find((p) => p.dataKey === 'total')
  const termItems = payload.filter((p) => p.dataKey !== 'total')

  return (
    <div
      className="rounded-lg border bg-white p-2 sm:p-3 shadow-lg max-w-[80vw]"
      style={{ pointerEvents: 'none' }}
    >
      <div className="text-xs sm:text-sm font-semibold text-gray-800">
        {label}
      </div>

      {totalItem && (
        <div className="mt-1 flex items-center gap-2 text-xs sm:text-sm">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: '#fed7aa' }}
          />
          <span className="text-gray-600">기사 수</span>
          <span className="ml-auto font-medium text-gray-900">
            {totalItem.value as number}
          </span>
        </div>
      )}

      {termItems.map((it) => (
        <div
          key={String(it.dataKey)}
          className="mt-0.5 flex items-center gap-2 text-xs sm:text-sm"
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: '#f97316' }}
          />
          <span className="truncate text-gray-600">{String(it.dataKey)}</span>
          <span className="ml-auto font-medium text-gray-900">
            {it.value as number}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function NewsPage() {
  const [days, setDays] = useState<1 | 3 | 7>(3)

  // 키워드: 쉼표(,) 구분 (트렌드), 리스트 필터는 공백/쉼표 모두 AND 처리
  const [query, setQuery] = useState('한화투자증권')
  const [selectedPublishers, setSelectedPublishers] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [showPublishers, setShowPublishers] = useState(false) // 기본: 접힘

  // 목록
  const { data, isLoading, mutate } = useSWR<ListResp>(
    `/api/news/list?days=${days}`, fetcher, { refreshInterval: 0, revalidateOnFocus: false }
  )
  const listRaw = useMemo(() => (data?.ok ? data.list : []), [data])
  const allPublishers = useMemo(() => data?.publishers ?? [], [data])

  // 트렌드
  const trendTerms = useMemo(
    () => query.split(',').map(s => s.trim()).filter(Boolean),
    [query]
  )
  const trendDays = Math.max(Number(days), 7)
  const trendKey = useMemo(
    () => `/api/news/trend?days=${trendDays}&terms=${encodeURIComponent(trendTerms.join(','))}`,
    [trendDays, trendTerms]
  )
  const { data: trend } = useSWR<TrendResp>(trendKey, fetcher, { refreshInterval: 0, revalidateOnFocus: false })

  // 리스트 필터링
  const filtered = useMemo(() => {
    const qs = query
      .split(',')
      .join(' ')
      .split(/\s+/)
      .map(s => s.trim())
      .filter(Boolean)

    const hasPublisherFilter = selectedPublishers.length > 0

    return listRaw.filter((n) => {
      if (hasPublisherFilter) {
        const p = n.publisher || 'Unknown'
        if (!selectedPublishers.includes(p)) return false
      }
      if (qs.length > 0) {
        const hay = `${n.title} ${n.snippet || ''} ${n.publisher || ''}`.toLowerCase()
        for (const term of qs) {
          if (!hay.includes(term.toLowerCase())) return false
        }
      }
      return true
    })
  }, [listRaw, query, selectedPublishers])

  // 날짜 그룹
  const grouped = useMemo(() => {
    const map = new Map<string, NewsRow[]>()
    for (const n of filtered) {
      const key = ymd(n.published_at || n.fetched_at)
      const arr = map.get(key) || []
      arr.push(n)
      map.set(key, arr)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  // 하이라이트 단어 배열
  const queryTerms = useMemo(
    () => query.split(',').join(' ').split(/\s+/).map(s => s.trim()).filter(Boolean),
    [query]
  )

  const togglePublisher = (name: string) => {
    setSelectedPublishers((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    )
  }

  const clearFilters = () => {
    setSelectedPublishers([])
    setQuery('한화투자증권')
  }

  // 수동 수집 + Δrows 배너
  const manualIngest = async () => {
    setNotice(null)
    const before = await fetch('/api/news/debug-count', { cache: 'no-store' })
      .then(r => r.json()).catch(() => ({ ok:false, count: null }))
    const beforeCount = before?.ok ? Number(before.count ?? 0) : null

    const res = await fetch('/api/news/fetch', { cache: 'no-store' })
    let collected: number | null = null
    let inserted: number | null = null
    let errorText: string | null = null
    try {
      const json = await res.json()
      if (json?.ok) {
        collected = Number(json.collected ?? 0)
        inserted  = Number(json.inserted ?? 0)
      } else {
        errorText = json?.error || res.statusText
      }
    } catch {
      errorText = '수집 응답 파싱 실패'
    }

    const after = await fetch('/api/news/debug-count', { cache: 'no-store' })
      .then(r => r.json()).catch(() => ({ ok:false, count: null }))
    const afterCount = after?.ok ? Number(after.count ?? 0) : null

    if (errorText) {
      setNotice(`수집 실패: ${errorText}`)
    } else {
      const delta = (beforeCount != null && afterCount != null) ? (afterCount - beforeCount) : null
      setNotice(
        `수집 완료: collected=${collected ?? '-'}, inserted=${inserted ?? '-'}`
        + (delta != null ? `, Δrows=${delta}` : '')
      )
    }
    mutate()
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">News</h1>
          <p className="text-sm text-gray-500 mt-1">
            ‘한화투자증권’ 최신 뉴스
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 기간 토글 */}
          <div className="inline-flex items-center rounded-lg border bg-white overflow-hidden">
            <button
              className={`px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap ${days === 1 ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              onClick={() => setDays(1)}
            >
              1일
            </button>
            <button
              className={`px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap ${days === 3 ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              onClick={() => setDays(3)}
            >
              3일
            </button>
            <button
              className={`px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap ${days === 7 ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              onClick={() => setDays(7)}
            >
              7일
            </button>
          </div>

          {/* 새로고침 */}
          <button
            onClick={() => mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap hover:bg-gray-50"
            title="새로고침"
          >
            <RefreshCcw className="h-4 w-4" />
            새로고침
          </button>

          {/* 수동 수집 */}
          <button
            onClick={manualIngest}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap hover:bg-gray-50"
            title="지금 수집"
          >
            수동 수집
          </button>
        </div>
      </div>

      {/* 알림 배너 */}
      {notice && (
        <div className="rounded-lg border bg-white p-3 text-sm text-gray-800 shadow-sm">
          {notice}
        </div>
      )}

      {/* 검색/필터 바 */}
      <div className="rounded-xl border bg-white p-3 md:p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          {/* 키워드 입력 (쉼표로 다중 키워드) */}
          <label className="flex items-center gap-2 flex-1">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="키워드 입력 (쉼표 구분: 한화투자증권, 실적, 리서치)"
              className="flex-1 outline-none bg-transparent text-sm"
            />
          </label>

          {/* 언론사 필터 토글 (기본 접힘) */}
          <button
            onClick={() => setShowPublishers(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap hover:bg-gray-50"
            aria-expanded={showPublishers}
            aria-controls="publisher-filter-panel"
          >
            {showPublishers ? '언론사 접기' : '언론사 펼치기'}
          </button>

          {/* 필터 초기화 */}
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap hover:bg-gray-50"
            title="필터 초기화"
          >
            <FilterX className="h-4 w-4" />
            초기화
          </button>
        </div>

        {/* 언론사 필터 패널 (접기/펼치기) */}
        {showPublishers && (
          <div id="publisher-filter-panel" className="mt-3 flex flex-wrap gap-2">
            {allPublishers.map((p) => {
              const active = selectedPublishers.includes(p)
              return (
                <button
                  key={p}
                  onClick={() => togglePublisher(p)}
                  className={[
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs whitespace-nowrap',
                    active
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {p}
                </button>
              )
            })}
            {allPublishers.length === 0 && (
              <span className="text-xs text-gray-500">언론사 목록 없음</span>
            )}
          </div>
        )}
      </div>

      {/* 트렌드 차트 (주황 라인 + 연한 주황 막대 + 모바일 친화 툴팁 + 바 라벨) */}
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <LineChartIcon className="h-4 w-4 text-gray-600" />
          <h2 className="text-lg font-semibold">
            키워드 트렌드 & 일별 기사 건수 (최근 {trendDays}일)
          </h2>
        </div>

        <div className="w-full" style={{ height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={trend?.series || []} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />

              {/* 일별 기사 건수: 막대 (연한 주황), 테두리 없음, 라벨 표시 */}
              <Bar
                dataKey="total"
                fill="#fed7aa"         // orange-200
                // stroke 미지정 → 테두리 없음
                legendType="none"      // 범례 숨김 (보조용 시각화)
                radius={[4, 4, 0, 0]}  // 상단 라운드
              >
                <LabelList
                  dataKey="total"
                  position="top"
                  style={{ fill: '#6b7280', fontSize: 10 }} // gray-500
                />
              </Bar>

              {/* 키워드 라인: 주황 + 표식(점) 표시 */}
              {(trend?.terms || []).map((t) => (
                <Line
                  key={t}
                  type="monotone"
                  dataKey={t}
                  stroke="#f97316"                           // orange-500
                  strokeWidth={2}
                  dot={{ r: 3, stroke: '#f97316', fill: '#f97316' }}       // 표식
                  activeDot={{ r: 5, stroke: '#f97316', fill: '#f97316' }} // hover 시 강조
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 로딩 스켈레톤 */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 빈 상태 */}
      {!isLoading && grouped.length === 0 && (
        <div className="rounded-xl border bg-white p-8 shadow-sm text-center text-gray-600">
          조건에 맞는 기사가 없습니다.
        </div>
      )}

      {/* 날짜별 섹션 */}
      {grouped.map(([date, itemsRaw]) => {
        const items = Array.isArray(itemsRaw) ? itemsRaw : []
        const badge = topicBadge(items.length)
        return (
          <section key={date} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{date}</h2>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${badge.cls}`}>
                {badge.label} · {items.length}건
              </span>
            </div>

            <ul className="mt-3 divide-y">
              {items.map((n) => (
                <li key={n.id} className="py-3">
                  <div className="flex flex-col gap-1">
                    {/* 제목 */}
                    <Link
                      href={n.source_url}
                      target="_blank"
                      className="font-medium hover:underline break-words"
                    >
                      {highlight(n.title, queryTerms)}
                      <ExternalLink className="inline ml-1 h-3.5 w-3.5 align-[-2px]" />
                    </Link>

                    {/* 메타 */}
                    <div className="text-xs text-gray-500">
                      {n.publisher || 'Unknown'} · {hhmm(n.published_at || n.fetched_at)}
                    </div>

                    {/* 요약 프리뷰 */}
                    {n.snippet && (
                      <p className="text-sm text-gray-700 mt-1 leading-relaxed">
                        {highlight(n.snippet, queryTerms)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
