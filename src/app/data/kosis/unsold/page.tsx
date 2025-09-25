//src\app\data\kosis\unsold\page.tsx
'use client'

import Link from 'next/link'
import { useMemo, useEffect, useState } from 'react'

type ApiOk<T> = { ok: true; status: number; data?: T; inserted?: number; skipped?: number; attempts?: Attempt[] }
type ApiErr = { ok: false; status: number; message: string; details?: unknown }
type ApiResp<T> = ApiOk<T> | ApiErr

type Attempt =
  | { scope: string; ok: true; count: number; usedParams: Record<string, string> }
  | { scope: string; ok: false; error: string; usedParams: Record<string, string> }

type Row = {
  prd_de: string
  region_code: string
  region_name: string | null
  itm_id: string
  itm_name: string | null
  unit: string | null
  value: number | null
}

function defaultYmRange(): { start: string; end: string } {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  if (m === 1) return { start: `${y - 1}01`, end: `${y - 1}12` }
  const prev = new Date(y, m - 2, 1)
  return { start: `${y}01`, end: `${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, '0')}` }
}
function fmtNum(n: number | null): string { return n == null ? '-' : n.toLocaleString() }
function yyyymmToLabel(ym: string): string { return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}-${ym.slice(4)}` : ym }
function summarizeAttempts(attempts?: Attempt[]) {
  if (!attempts) return { successCount: 0, failCount: 0, lastSuccessMonth: '' }
  const success = attempts.filter((a) => a.ok && a.count >= 0) as Array<{ scope: string; ok: true; count: number }>
  const fail = attempts.filter((a) => !a.ok)
  const successWithData = success.filter((s) => s.count > 0)
  const lastSuccessMonth =
    successWithData.length > 0
      ? successWithData.map((s) => s.scope).sort().at(-1) ?? ''
      : success.length > 0
      ? success.map((s) => s.scope).sort().at(-1) ?? ''
      : ''
  return { successCount: success.length, failCount: fail.length, lastSuccessMonth }
}

export default function Page() {
  // 수집
  const def = useMemo(defaultYmRange, [])
  const [ingStart, setIngStart] = useState(def.start)
  const [ingEnd, setIngEnd] = useState(def.end)
  const [ingSido, setIngSido] = useState('ALL')
  const [ingSigungu, setIngSigungu] = useState('ALL')
  const [ingLoading, setIngLoading] = useState(false)
  const [ingMsg, setIngMsg] = useState('')
  const [attempts, setAttempts] = useState<Attempt[] | undefined>(undefined)

  // 조회
  const [start, setStart] = useState(def.start)
  const [end, setEnd] = useState(def.end)
  const [sido, setSido] = useState('')
  const [sigungu, setSigungu] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listUrl = useMemo(() => {
    const p = new URLSearchParams()
    p.set('start', start)
    p.set('end', end)
    if (sido) p.set('sido', sido)
    if (sigungu) p.set('sigungu', sigungu)
    return `/api/kosis/unsold/list?${p.toString()}`
  }, [start, end, sido, sigungu])

  const ingest = async (): Promise<void> => {
    setIngLoading(true)
    setIngMsg('')
    setAttempts(undefined)
    try {
      const res = await fetch('/api/kosis/ingest/unsold', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          start: ingStart,
          end: ingEnd,
          sido: ingSido !== 'ALL' ? ingSido : undefined,
          sigungu: ingSigungu !== 'ALL' ? ingSigungu : undefined,
        }),
      })
      const text = await res.text()
      let data: ApiResp<unknown>
      try { data = JSON.parse(text) } catch { data = { ok: false, status: res.status, message: text.slice(0, 300) } }
      if (!res.ok || !data.ok) throw new Error(('message' in data && data.message) || `HTTP ${res.status}`)

      const s = summarizeAttempts((data as ApiOk<unknown>).attempts)
      setAttempts((data as ApiOk<unknown>).attempts)
      setIngMsg(`완료: success=${s.successCount}, fail=${s.failCount}${s.lastSuccessMonth ? `, last=${s.lastSuccessMonth}` : ''}`)
    } catch (e) {
      setIngMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setIngLoading(false)
    }
  }

  const fetchList = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setRows([])
    try {
      const res = await fetch(listUrl)
      const text = await res.text()
      let data: ApiResp<Row[]>
      try { data = JSON.parse(text) } catch { data = { ok: false, status: res.status, message: text } }
      if (!res.ok || !data.ok) throw new Error(('message' in data && data.message) || `HTTP ${res.status}`)
      setRows((data as ApiOk<Row[]>).data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // 초기 자동 1회 조회
  useEffect(() => { void fetchList() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [])

  const headers = rows[0] ? Object.keys(rows[0] as any) : ['prd_de', 'region_name', 'itm_name', 'value']
  const attemptSummary = summarizeAttempts(attempts)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500 whitespace-nowrap">KOSIS</div>
          <h2 className="text-2xl font-bold whitespace-nowrap">미분양주택 현황 (시도/시군구)</h2>
        </div>
        <Link href="/data" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 whitespace-nowrap">← 뒤로가기</Link>
      </div>

      {/* API 수집 */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold whitespace-nowrap">API 수집 (기간: 월)</div>
          <div className="text-xs text-gray-500 whitespace-nowrap">DB 테이블: kosis_unsold</div>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-8 gap-3 items-end">
          <label className="text-sm">
            <div className="text-gray-600 mb-1">시작(YYYYMM)</div>
            <input value={ingStart} onChange={(e) => setIngStart(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">끝(YYYYMM)</div>
            <input value={ingEnd} onChange={(e) => setIngEnd(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">시도코드(옵션)</div>
            <input value={ingSido} onChange={(e) => setIngSido(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">시군구코드(옵션)</div>
            <input value={ingSigungu} onChange={(e) => setIngSigungu(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <div className="flex gap-2 sm:col-span-4">
            <button onClick={ingest} disabled={ingLoading} className="inline-flex items-center justify-center min-w-[96px] rounded-md bg-black text-white px-4 py-2.5 disabled:opacity-50">
              {ingLoading ? '수집 중…' : '수집'}
            </button>
            <div className="text-sm text-gray-600 self-center">{ingMsg}</div>
          </div>
        </div>

        {/* attempts 요약 */}
        <div className="mt-3 text-sm text-gray-700">
          <div className="inline-flex gap-3 rounded-md border px-3 py-2 bg-gray-50">
            <span>성공: <b>{attemptSummary.successCount}</b></span>
            <span>실패: <b>{attemptSummary.failCount}</b></span>
            {attemptSummary.lastSuccessMonth && <span>마지막 성공 월: <b>{yyyymmToLabel(attemptSummary.lastSuccessMonth)}</b></span>}
          </div>
        </div>
      </div>

      {/* DB 조회 */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="font-semibold whitespace-nowrap">DB 조회 (기간: 월)</div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-8 gap-3 items-end">
          <label className="text-sm">
            <div className="text-gray-600 mb-1">시작(YYYYMM)</div>
            <input value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">끝(YYYYMM)</div>
            <input value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">시도코드(옵션)</div>
            <input value={sido} onChange={(e) => setSido(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">시군구코드(옵션)</div>
            <input value={sigungu} onChange={(e) => setSigungu(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </label>
          <div className="flex gap-2 sm:col-span-4">
            <button onClick={fetchList} disabled={loading} className="inline-flex items-center justify-center min-w-[96px] rounded-md border px-4 py-2.5">
              {loading ? '조회 중…' : '조회'}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-auto rounded border">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr>{headers.map((h) => <th key={h} className="text-left px-3 py-2 border-b">{h}</th>)}</tr>
            </thead>
            <tbody>
              {error ? (
                <tr><td className="px-3 py-6 text-red-600" colSpan={headers.length}>{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="px-3 py-6 text-gray-500" colSpan={headers.length}>조회 결과가 없습니다.</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {headers.map((h) => {
                      const v = (r as any)[h]
                      return <td key={h} className="px-3 py-2 border-b">{h === 'value' ? fmtNum(v as number | null) : String(v ?? '')}</td>
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
