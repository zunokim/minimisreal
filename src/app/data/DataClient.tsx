// src/app/data/DataClient.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { DATASETS, type DatasetKey, pickTable } from '@/lib/datasets'

type Option = { value: string; label: string }

type DataRow = {
  prd_de: string
  prd_se: string | null
  region_code: string
  region_name: string | null
  itm_id: string
  itm_name: string | null
  unit: string | null
  value: number | null
}

type RegionRow = {
  region_code: string
  region_name: string | null
}

type ItmRow = {
  itm_id: string
  itm_name: string | null
}

function ymNow(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}
function ymAdd(ym: string, diff: number): string {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(4))
  const d = new Date(y, m - 1 + diff, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}
function formatNumber(n: number | null, unit?: string | null): string {
  if (n === null || n === undefined) return '-'
  try {
    const s = n.toLocaleString()
    return unit ? `${s} ${unit}` : s
  } catch {
    return String(n)
  }
}

export default function DataClient() {
  const [open, setOpen] = useState<DatasetKey | null>(null)

  // ===== 모달 내 상태 =====
  const [start, setStart] = useState<string>(ymAdd(ymNow(), -11)) // 최근 12개월
  const [end, setEnd] = useState<string>(ymNow())

  const [region, setRegion] = useState<string>('ALL')
  const [itm, setItm] = useState<string>('ALL')

  const [regionOptions, setRegionOptions] = useState<Option[]>([{ value: 'ALL', label: '전체' }])
  const [itmOptions, setItmOptions] = useState<Option[]>([{ value: 'ALL', label: '전체' }])

  const [loading, setLoading] = useState<boolean>(false)
  const [rows, setRows] = useState<DataRow[]>([])
  const [error, setError] = useState<string | null>(null)

  // 모달 열릴 때 기본값/옵션 로드
  useEffect(() => {
    const loadOptions = async () => {
      if (!open) return
      const table = pickTable(open)

      // region 옵션(코드/이름)
      const { data: regionData } = await supabase
        .from(table)
        .select('region_code, region_name', { head: false })
        .not('region_code', 'is', null)
        .limit(1_000)
        .returns<RegionRow[]>()

      const regionMap = new Map<string, string | null>()
      for (const r of regionData ?? []) {
        regionMap.set(r.region_code, r.region_name)
      }
      const regionOpts: Option[] = [{ value: 'ALL', label: '전체' }]
      for (const [code, name] of regionMap.entries()) {
        regionOpts.push({ value: code, label: name ?? code })
      }
      regionOpts.sort((a, b) => a.label.localeCompare(b.label, 'ko'))
      setRegionOptions(regionOpts)

      // itm 옵션
      const { data: itmData } = await supabase
        .from(table)
        .select('itm_id, itm_name', { head: false })
        .not('itm_id', 'is', null)
        .limit(1_000)
        .returns<ItmRow[]>()

      const itmMap = new Map<string, string | null>()
      for (const r of itmData ?? []) {
        itmMap.set(r.itm_id, r.itm_name)
      }
      const itmOpts: Option[] = [{ value: 'ALL', label: '전체' }]
      for (const [code, name] of itmMap.entries()) {
        itmOpts.push({ value: code, label: name ?? code })
      }
      itmOpts.sort((a, b) => a.label.localeCompare(b.label, 'ko'))
      setItmOptions(itmOpts)

      // 기본값 리셋
      setRegion('ALL')
      setItm('ALL')
      setRows([])
      setError(null)
    }
    void loadOptions()
  }, [open])

  const title = useMemo(() => (open ? DATASETS[open].title : ''), [open])
  const tableName = useMemo(() => (open ? pickTable(open) : ''), [open])

  const fetchRows = async () => {
    if (!open) return
    setLoading(true)
    setError(null)
    setRows([])

    let query = supabase
      .from(tableName)
      .select(
        'prd_de, prd_se, region_code, region_name, itm_id, itm_name, unit, value',
        { head: false }
      )
      .gte('prd_de', start)
      .lte('prd_de', end)

    if (region !== 'ALL') query = query.eq('region_code', region)
    if (itm !== 'ALL') query = query.eq('itm_id', itm)

    query = query.order('prd_de', { ascending: false }).order('region_code', { ascending: true })

    const { data, error: err } = await query.returns<DataRow[]>()
    if (err) {
      setError(err.message)
    } else {
      setRows(data ?? [])
    }
    setLoading(false)
  }

  const downloadCsv = () => {
    if (!open) return
    const url = new URL(`/api/export/${open}`, window.location.origin)
    url.searchParams.set('start', start)
    url.searchParams.set('end', end)
    url.searchParams.set('region', region)
    url.searchParams.set('itm', itm)
    window.location.href = url.toString()
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <h2 className="text-2xl font-bold">API Data</h2>

      {/* 카드 섹션 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(DATASETS) as DatasetKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setOpen(key)}
            className="text-left rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md active:scale-[0.99] transition"
          >
            <div className="text-sm text-gray-500">{DATASETS[key].source}</div>
            <div className="text-lg font-semibold mt-1">{DATASETS[key].title}</div>
            <div className="text-sm text-gray-600 mt-1">{DATASETS[key].desc}</div>
            <div className="mt-3 inline-flex items-center gap-2 text-blue-600 font-medium">
              자세히 보기
              <span aria-hidden>→</span>
            </div>
          </button>
        ))}
      </div>

      {/* 모달 */}
      {open && (
        <>
          {/* 배경 오버레이 */}
          <button
            className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-40"
            aria-label="닫기"
            onClick={() => setOpen(null)}
          />
          {/* 모달 본문 */}
          <div className="fixed inset-x-0 top-16 mx-auto max-w-6xl z-50">
            <div className="rounded-2xl border bg-white shadow-xl p-4 md:p-6">
              {/* 헤더 */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-gray-500">{open ? DATASETS[open].source : ''}</div>
                  <h3 className="text-xl font-bold">{title}</h3>
                </div>
                <button
                  onClick={() => setOpen(null)}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  닫기
                </button>
              </div>

              {/* 필터 */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                <label className="text-sm">
                  <div className="text-gray-600 mb-1">시작(YYYYMM)</div>
                  <input
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    placeholder="예: 202301"
                    className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring focus:ring-gray-200"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-gray-600 mb-1">끝(YYYYMM)</div>
                  <input
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    placeholder="예: 202512"
                    className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring focus:ring-gray-200"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-gray-600 mb-1">지역</div>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 bg-white"
                  >
                    {regionOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <div className="text-gray-600 mb-1">항목</div>
                  <select
                    value={itm}
                    onChange={(e) => setItm(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 bg-white"
                  >
                    {itmOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* 액션 버튼 */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={fetchRows}
                  disabled={loading}
                  className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 active:scale-[0.99]"
                >
                  {loading ? '조회 중…' : '조회'}
                </button>
                <button
                  onClick={downloadCsv}
                  className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 active:scale-[0.99]"
                >
                  CSV 다운로드
                </button>
              </div>

              {/* 데이터 테이블 */}
              <div className="mt-4 border rounded-xl overflow-hidden">
                <div className="max-h-[50vh] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
                        <th>시점(PRD_DE)</th>
                        <th>지역</th>
                        <th>항목</th>
                        <th className="text-right">값</th>
                      </tr>
                    </thead>
                    <tbody>
                      {error ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-red-600">
                            {error}
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-gray-500">
                            조회 결과가 없습니다. 위의 필터를 설정한 뒤 &quot;조회&quot;를 눌러주세요.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr
                            key={`${r.prd_de}-${r.region_code}-${r.itm_id}-${i}`}
                            className="odd:bg-white even:bg-gray-50"
                          >
                            <td className="px-3 py-2">{r.prd_de}</td>
                            <td className="px-3 py-2">{r.region_name ?? r.region_code}</td>
                            <td className="px-3 py-2">{r.itm_name ?? r.itm_id}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(r.value, r.unit)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-500">
                출처: {open ? DATASETS[open].source : ''} · 테이블: {tableName}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}