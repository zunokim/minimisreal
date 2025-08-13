// src/app/news/page.tsx
'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ExternalLink, RefreshCcw, Search, FilterX } from 'lucide-react'

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

type ApiResp = { ok: boolean; list: NewsRow[]; publishers: string[] }

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

function topicBadge(count: number) {
  if (count >= 20) return { label: '🔥 High', cls: 'bg-red-100 text-red-700 border-red-200' }
  if (count >= 10) return { label: '⚡ Medium', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' }
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

export default function NewsPage() {
  const [days, setDays] = useState<1 | 3 | 7>(3)
  const [query, setQuery] = useState('한화투자증권')
  const [selectedPublishers, setSelectedPublishers] = useState<string[]>([])

  const { data, isLoading, mutate } = useSWR<ApiResp>(`/api/news/list?days=${days}`, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  })

  const listRaw = useMemo(() => (data?.ok ? data.list : []), [data])
  const allPublishers = useMemo(() => data?.publishers ?? [], [data])

  // 필터링
  const filtered = useMemo(() => {
    const q = query.trim()
    const qs = q ? q.split(/\s+/) : []
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

  // 날짜별 그룹
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

  const queryTerms = useMemo(() => (query.trim().length ? query.trim().split(/\s+/) : []), [query])

  const togglePublisher = (name: string) => {
    setSelectedPublishers((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    )
  }

  const clearFilters = () => {
    setSelectedPublishers([])
    setQuery('한화투자증권')
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">News</h1>
          <p className="text-sm text-gray-500 mt-1">
            ‘한화투자증권’ 관련 최신 뉴스 (중복 제거 · 요약 프리뷰 · 필터/하이라이트)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* 기간 토글 */}
          <div className="inline-flex items-center rounded-lg border bg-white">
            <button
              className={`px-3 py-1.5 text-sm rounded-l-lg ${
                days === 1 ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
              onClick={() => setDays(1)}
            >
              1일
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${
                days === 3 ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
              onClick={() => setDays(3)}
            >
              3일
            </button>
            <button
              className={`px-3 py-1.5 text-sm rounded-r-lg ${
                days === 7 ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
              onClick={() => setDays(7)}
            >
              7일
            </button>
          </div>

          {/* 새로고침 */}
          <button
            onClick={() => mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            title="새로고침"
          >
            <RefreshCcw className="h-4 w-4" />
            새로고침
          </button>

          {/* (개발 편의) 지금 수집 — 필요 없으면 삭제하세요 */}
          <button
            onClick={async () => {
              await fetch('/api/news/fetch', { cache: 'no-store' })
              mutate()
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            title="지금 수집"
          >
            수동 수집
          </button>
        </div>
      </div>

      {/* 검색/필터 바 */}
      <div className="rounded-xl border bg-white p-3 md:p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          {/* 키워드 입력 */}
          <label className="flex items-center gap-2 flex-1">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="키워드 입력 (예: 한화투자증권, 리서치, 실적)"
              className="flex-1 outline-none bg-transparent text-sm"
            />
          </label>

          {/* 필터 초기화 */}
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            title="필터 초기화"
          >
            <FilterX className="h-4 w-4" />
            초기화
          </button>
        </div>

        {/* 언론사 필터 (태그 토글) */}
        <div className="mt-3 flex flex-wrap gap-2">
          {allPublishers.map((p) => {
            const active = selectedPublishers.includes(p)
            return (
              <button
                key={p}
                onClick={() => togglePublisher(p)}
                className={[
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
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
      </div>

      {/* 로딩 스켈레톤 */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
                <div className="h-6 w-24 bg-gray-200 rounded-full border animate-pulse" />
              </div>
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

      {/* 섹션 목록 */}
      {grouped.map(([date, items]) => {
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
