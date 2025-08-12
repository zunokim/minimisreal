// src/lib/kosis.ts
/* KOSIS 호출 + 정규화 유틸 (메타/데이터 공통) */

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }
export type KosisRawRow = Record<string, string | undefined>

export interface NormalizeOptions {
  orgId: string
  tblId: string
  regionKey: 'C1' | 'C2' | 'C3' | string
}

function toNumberSafe(v: string | undefined): number {
  if (!v) return 0
  const t = v.trim()
  if (!t || t === '-' || t === '.') return 0
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

const RAW_API_KEY = process.env.KOSIS_API_KEY ?? ''
const API_KEY = RAW_API_KEY.trim()
if (!API_KEY) console.warn('⚠️ Missing KOSIS_API_KEY')

// 엔드포인트
const KOSIS_DATA_BASE =
  'https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList'
const KOSIS_META_BASE =
  'https://kosis.kr/openapi/Param/statisticsParameterMeta.do?method=getMeta'

// 🔧 헤더 보강 (일부 환경에서 UA/Accept/Referer 없으면 HTML 반환)
const DEFAULT_HEADERS: HeadersInit = {
  'User-Agent': 'minimisreal/1.0 (+https://minimisreal.vercel.app)',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://kosis.kr/openapi/',
}

// 간단 재시도 유틸
async function fetchWithRetry(url: string, init: RequestInit, tries = 2): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, redirect: 'follow', cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetch failed')
}

// 느슨한 JSON 파서 (비표준 키/값 및 HTML 에러페이지 감지)
function parseLooseJson(text: string): unknown {
  const trimmed = text.trim()

  // HTML이면 바로 에러
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    throw new Error(`Non-JSON response. Preview: ${trimmed.slice(0, 200)}`)
  }

  // 정상 JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return JSON.parse(trimmed)
  }

  // 비표준 포맷: {TBL_NM:"..."} / 키에 따옴표 없음
  if (/^\s*\{/.test(trimmed)) {
    const fixed = trimmed
      .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":') // 키 따옴표
      .replace(/:\s*'([^']*)'/g, ':"$1"') // 홑따옴표 값
    return JSON.parse(fixed)
  }

  throw new Error(`Non-JSON response. Preview: ${trimmed.slice(0, 200)}`)
}

/** 데이터 조회 */
export async function fetchKosisData(params: Record<string, string>): Promise<KosisRawRow[]> {
  const url = new URL(KOSIS_DATA_BASE)
  url.searchParams.set('apiKey', API_KEY)
  url.searchParams.set('format', 'json')
  url.searchParams.set('jsonVD', 'Y')
  // 캐시/엣지 변덕 회피용 난수
  url.searchParams.set('_', Date.now().toString())
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetchWithRetry(url.toString(), { headers: DEFAULT_HEADERS })
  const txt = await res.text()
  const parsed = parseLooseJson(txt)

  if (Array.isArray(parsed)) return parsed as KosisRawRow[]

  // {err:".."} 형태 에러면 메시지 던지기
  const obj = parsed as { err?: string; errMsg?: string } | undefined
  if (obj?.err || obj?.errMsg) {
    throw new Error(`KOSIS error ${obj.err ?? ''}: ${obj.errMsg ?? 'unknown'}`)
  }
  throw new Error(`KOSIS returned non-array. Preview: ${txt.slice(0, 200)}`)
}

/** 메타 조회 (TBL/OBJ/ITM) */
export async function fetchKosisMeta(params: { orgId: string; tblId: string; type?: string }): Promise<unknown> {
  const url = new URL(KOSIS_META_BASE)
  url.searchParams.set('apiKey', API_KEY)
  url.searchParams.set('format', 'json')
  url.searchParams.set('jsonVD', 'Y')
  url.searchParams.set('orgId', params.orgId)
  url.searchParams.set('tblId', params.tblId)
  if (params.type) url.searchParams.set('type', params.type)
  url.searchParams.set('_', Date.now().toString())

  const res = await fetchWithRetry(url.toString(), { headers: DEFAULT_HEADERS })
  const txt = await res.text()
  return parseLooseJson(txt)
}

/** 정규화 결과 타입 */
export interface KosisNormalizedRow {
  org_id: string
  tbl_id: string
  prd_se: string
  prd_de: string
  region_code: string
  region_name: string
  itm_id: string
  itm_name: string
  unit: string
  value: number
  raw: JsonValue
}

/** 정규화 (C1/C2/C3 지원 + 내부 중복 제거) */
export function normalizeKosisRows(rawRows: KosisRawRow[], opts: NormalizeOptions): KosisNormalizedRow[] {
  const { orgId, tblId, regionKey } = opts

  const rows: KosisNormalizedRow[] = rawRows.map((r) => {
    const prd_se = r.PRD_SE ?? ''
    const prd_de = r.PRD_DE ?? ''
    const itm_id = (r.ITM_ID ?? 'ALL').trim()
    const itm_name = (r.ITM_NM ?? '항목').trim()
    const unit = (r.UNIT_NM ?? '').trim()
    const value = toNumberSafe(r.DT)

    const c1 = r['C1'] ?? ''
    const c1_nm = r['C1_NM'] ?? ''
    const c2 = r['C2'] ?? ''
    const c2_nm = r['C2_NM'] ?? ''
    const c3 = r['C3'] ?? ''
    const c3_nm = r['C3_NM'] ?? ''

    let region_code = ''
    let region_name = ''

    if (regionKey === 'C1') {
      region_code = c1
      region_name = c1_nm || c1 || '(C1)'
    } else if (regionKey === 'C2') {
      region_code = `${c1}|${c2}`.trim() // 충돌 방지용 복합키
      region_name = c2_nm ? (c1_nm ? `${c1_nm} ${c2_nm}` : c2_nm) : (c1_nm || '(C2)')
    } else if (regionKey === 'C3') {
      region_code = `${c1}|${c2}|${c3}`.trim()
      region_name = [c1_nm, c2_nm, c3_nm].filter(Boolean).join(' ')
    } else {
      const ck = r[regionKey] ?? ''
      const ckn = r[`${regionKey}_NM`] ?? ''
      region_code = ck
      region_name = ckn || ck || '(REGION)'
    }

    return {
      org_id: orgId,
      tbl_id: tblId,
      prd_se,
      prd_de,
      region_code,
      region_name,
      itm_id,
      itm_name,
      unit,
      value,
      raw: (r as unknown) as JsonValue,
    }
  })

  const dedup = new Map<string, KosisNormalizedRow>()
  for (const row of rows) {
    const key = `${row.org_id}|${row.tbl_id}|${row.prd_de}|${row.region_code}|${row.itm_id}`
    dedup.set(key, row)
  }
  return Array.from(dedup.values())
}
