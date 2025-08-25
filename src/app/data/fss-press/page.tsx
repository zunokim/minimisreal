// src/app/data/fss-press/page.tsx
'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

type PressItem = {
  contentId: string
  subject: string
  publishOrg: string
  originUrl: string
  viewCnt: number | string
  regDate: string
  atchfileUrl?: string
  atchfileNm?: string
  contentsKor?: string
}

type ApiResponse = {
  resultCnt: number
  result: PressItem[]
  period: { startDate: string; endDate: string }
  saved?: number
}

function decodeHtmlEntities(input?: string | null): string {
  if (!input) return ''
  let s = String(input)
  s = s.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ldquo;': '“',
    '&rdquo;': '”',
    '&lsquo;': '‘',
    '&rsquo;': '’',
    '&hellip;': '…',
    '&middot;': '·',
  }
  s = s.replace(/&[a-zA-Z]+?;|&#\d+;|&#x[0-9a-fA-F]+;/g, (m) => map[m] ?? m)
  return s
}

function formatDateInput(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function FssPressPage() {
  const today = useMemo(() => new Date(), [])
  const defEnd = useMemo(() => formatDateInput(today), [today])
  const defStart = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() - 30)
    return formatDateInput(d)
  }, [today])

  const [startDate, setStartDate] = useState(defStart)
  const [endDate, setEndDate] = useState(defEnd)
  const [subject, setSubject] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [syncInfo, setSyncInfo] = useState<string | null>(null)

  const disabled = useMemo(() => !startDate || !endDate, [startDate, endDate])

  const onSync = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setSyncInfo(null)

      const qs = new URLSearchParams()
      qs.set('startDate', startDate)
      qs.set('endDate', endDate)
      if (subject.trim()) qs.set('subject', subject.trim())
      qs.set('save', '1')

      const res = await fetch(`/api/fss/press?${qs.toString()}`, { method: 'GET', cache: 'no-store' })
      const json: unknown = await res.json()
      if (!res.ok) {
        const errMsg = (json as { error?: string }).error ?? 'API sync error'
        throw new Error(errMsg)
      }
      const saved = (json as { saved?: number }).saved ?? 0
      setSyncInfo(`동기화 완료: ${saved}건 저장`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '동기화 중 오류가 발생했습니다.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, subject])

  const onSearchDb = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setData(null)

      const qs = new URLSearchParams()
      qs.set('startDate', startDate)
      qs.set('endDate', endDate)
      if (subject.trim()) qs.set('subject', subject.trim())

      const res = await fetch(`/api/fss/press/db?${qs.toString()}`, { method: 'GET', cache: 'no-store' })
      const json: unknown = await res.json()
      if (!res.ok) {
        const errMsg = (json as { error?: string }).error ?? 'DB query error'
        throw new Error(errMsg)
      }
      setData(json as ApiResponse)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '조회 중 오류가 발생했습니다.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, subject])

  const onReset = useCallback(() => {
    setStartDate(defStart)
    setEndDate(defEnd)
    setSubject('')
    setData(null)
    setError(null)
    setSyncInfo(null)
  }, [defStart, defEnd])

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">금융감독원</div>
          <h1 className="text-2xl font-bold">보도자료(실적보고용)</h1>
          <p className="text-sm text-gray-600 mt-1">실적보고 사용을 위한 보도자료 크롤링</p>
        </div>
        <Link href="/data" className="shrink-0 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
          ← 뒤로가기
        </Link>
      </header>

      <section className="rounded-2xl border bg-white p-5 shadow-sm mb-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col">
            <label className="text-sm mb-1">조회 시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm mb-1">조회 종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white"
            />
          </div>
          <div className="flex flex-col md:col-span-2">
            <label className="text-sm mb-1">제목</label>
            <input
              type="text"
              placeholder="제목 키워드"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onSync}
            disabled={disabled || loading}
            className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-40"
          >
            {loading ? '수집 중…' : 'API 데이터 수집'}
          </button>
          <button
            onClick={onSearchDb}
            disabled={disabled || loading}
            className="px-4 py-2 rounded-lg border"
          >
            DB에서 조회
          </button>
          <button
            onClick={onReset}
            disabled={loading}
            className="px-4 py-2 rounded-lg border"
          >
            초기화
          </button>

          {data?.period && (
            <span className="text-xs text-gray-500 ml-auto">
              기간: {data.period.startDate} ~ {data.period.endDate} · 결과 {data.resultCnt}건
            </span>
          )}
        </div>

        <p className="mt-3 text-xs text-gray-500">
          * API 수집 후 조회는 DB 조회로 조회(API 횟수 제한 有)
        </p>

        {syncInfo && <div className="mt-2 text-sm text-emerald-700">{syncInfo}</div>}
      </section>

      {error && <div className="mb-4 text-sm text-red-600">오류: {error}</div>}

      <section className="space-y-3">
        {data?.result?.map((item) => {
          const title = decodeHtmlEntities(item.subject)
          const body = decodeHtmlEntities(item.contentsKor)
          const dateText = item.regDate ? new Date(item.regDate).toLocaleString() : ''
          return (
            <article key={item.contentId} className="border rounded-xl p-4 bg-white">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-1">
                <span>{item.publishOrg || '발행기관 미기재'}</span>
                <span>·</span>
                <time>{dateText}</time>
                <span>·</span>
                <span>조회수 {item.viewCnt}</span>
              </div>
              <a
                href={item.originUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-base md:text-lg font-semibold hover:underline"
              >
                {title || '(제목 없음)'}
              </a>
              {body && <p className="mt-2 text-sm whitespace-pre-line line-clamp-3">{body}</p>}

              {(item.atchfileUrl || item.atchfileNm) && (
                <div className="mt-2 text-sm">
                  <div className="font-medium mb-1">첨부</div>
                  <ul className="list-disc ml-5">
                    {splitAttachments(item).map((f, idx) => (
                      <li key={idx}>
                        {f.url ? (
                          <a href={f.url} target="_blank" rel="noreferrer" className="underline">
                            {decodeHtmlEntities(f.name || f.url)}
                          </a>
                        ) : (
                          <span>{decodeHtmlEntities(f.name)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          )
        })}

        {data && data.resultCnt === 0 && !error && (
          <div className="text-sm text-gray-500">조회 결과가 없습니다.</div>
        )}
      </section>
    </main>
  )
}

function splitAttachments(item: PressItem): { url?: string; name?: string }[] {
  const urls = (item.atchfileUrl ?? '').split('|').filter(Boolean)
  const names = (item.atchfileNm ?? '').split('|').filter(Boolean)
  const maxLen = Math.max(urls.length, names.length)
  const out: { url?: string; name?: string }[] = []
  for (let i = 0; i < maxLen; i++) {
    out.push({ url: urls[i], name: names[i] })
  }
  return out
}
