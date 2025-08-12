// src/lib/kosis.ts
/* KOSIS 호출 + 정규화 유틸 (데이터/메타 공통) */

// ---------- 타입 ----------
type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | { [k: string]: JsonValue } | JsonValue[]

export type KosisRawRow = Record<string, string>
export interface NormalizeOptions {
  orgId: string
  tblId: string
  /** 지역차원 키: C1(시도), C2(시군구), C3(읍면동) 등 */
  regionKey: 'C1' | 'C2' | 'C3' | string
}

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

// ---------- 공통 유틸 ----------
function toNumberSafe(v?: string): number {
  if (!v) return 0
  const t = v.trim()
  if (!t || t === '-' || t === '.') return 0
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

const RAW_API_KEY = process.env.KOSIS_API_KEY ?? ''
const API_KEY = RAW_API_KEY.trim()
if (!API_KEY) {
  // 런타임에 에러로 던지면 라우트 전체가 죽을 수 있어 경고만 남깁니다.
  console.warn('⚠️ Missing KOSIS_API_KEY')
}

const KOSIS_DATA_BASE =
  'https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList'
const KOSIS_META_BASE =
  'https://kosis.kr/openapi/statisticsData.do?method=getMeta' // 메타는 /Param 아님!

const DEFAULT_HEADERS: HeadersInit = {
  'User-Agent': 'minimisreal/1.0 (+https://minimisreal.vercel.app)',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: 'https://kosis.kr/openapi/',
}

// 간단 재시도
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

// 느슨한 JSON 파서 (비표준 키/값 & HTML 에러페이지 감지)
function parseLooseJson(text: string): unknown {
  const trimmed = text.trim()

  // HTML이면 오류
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    throw new Error(`Non-JSON response. Preview: ${trimmed.slice(0, 200)}`)
  }

  // 정상 JSON
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return JSON.parse(trimmed)
  }

  // 비표준: {TBL_NM:"..."} 같이 키에 쌍따옴표 없음
  if (/^\s*\{/.test(trimmed)) {
    const fixed = trimmed
      .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":') // 키에 쌍따옴표 부여
      .replace(/:\s*'([^']*)'/g, ':"$1"') // 홑따옴표 값을 쌍따옴표로
    return JSON.parse(fixed)
  }

  throw new Error(`Non-JSON response. Preview: ${trimmed.slice(0, 200)}`)
}

// ---------- 데이터 조회 (기존 이름 유지: fetchKosisData) ----------
export type KosisParamDataParams = {
  orgId: string
  tblId: string
  prdSe: 'Y' | 'H' | 'Q' | 'M' | 'D' | 'IR' | 'F' | 'S'
  startPrdDe?: string
  endPrdDe?: string
  itmId?: string // 기본 ALL
  objL1?: string // 기본 ALL
  objL2?: string // 필요시
  objL3?: string // 필요시
  format?: 'json'
}

async function _fetchKosisParamData(p: KosisParamDataParams): Promise<KosisRawRow[]> {
  const url = new URL(KOSIS_DATA_BASE)
  url.searchParams.set('apiKey', API_KEY)
  url.searchParams.set('format', p.format ?? 'json')
  url.searchParams.set('jsonVD', 'Y') // JSON 강제
  // 캐시 변덕 회피
  url.searchParams.set('_', Date.now().toString())

  url.searchParams.set('orgId', p.orgId)
  url.searchParams.set('tblId', p.tblId)
  url.searchParams.set('prdSe', p.prdSe)
  if (p.startPrdDe) url.searchParams.set('startPrdDe', p.startPrdDe)
  if (p.endPrdDe) url.searchParams.set('endPrdDe', p.endPrdDe)
  url.searchParams.set('itmId', p.itmId ?? 'ALL')
  if (p.objL1) url.searchParams.set('objL1', p.objL1)
  if (p.objL2) url.searchParams.set('objL2', p.objL2)
  if (p.objL3) url.searchParams.set('objL3', p.objL3)

  const res = await fetchWithRetry(url.toString(), { headers: DEFAULT_HEADERS })
  const txt = await res.text()
  const parsed = parseLooseJson(txt)

  if (Array.isArray(parsed)) {
    return parsed as KosisRawRow[]
  }

  // {err:".."} 형태
  const errObj = parsed as { err?: string; errMsg?: string } | undefined
  if (errObj?.err || errObj?.errMsg) {
    throw new Error(`KOSIS error ${errObj.err ?? ''}: ${errObj.errMsg ?? 'unknown'}`)
  }
  throw new Error(`KOSIS returned non-array. Preview: ${txt.slice(0, 200)}`)
}

/** ✅ 라우트가 기대하는 이름을 그대로 export */
export async function fetchKosisData(p: KosisParamDataParams): Promise<KosisRawRow[]> {
  return _fetchKosisParamData(p)
}

// ---------- 메타 조회 ----------
export async function fetchKosisTableMeta(orgId: string, tblId: string): Promise<unknown> {
  const url = new URL(KOSIS_META_BASE)
  url.searchParams.set('apiKey', API_KEY)
  url.searchParams.set('format', 'json')
  url.searchParams.set('jsonVD', 'Y')
  url.searchParams.set('type', 'TBL') // 메타 타입
  url.searchParams.set('orgId', orgId)
  url.searchParams.set('tblId', tblId)
  url.searchParams.set('_', Date.now().toString())

  const res = await fetchWithRetry(url.toString(), { headers: DEFAULT_HEADERS })
  const txt = await res.text()
  return parseLooseJson(txt)
}

// ---------- 정규화 (기존 이름 유지: normalizeKosisRows) ----------
export function normalizeKosisRows(
  rawRows: KosisRawRow[],
  opts: NormalizeOptions
): KosisNormalizedRow[] {
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
      // 시군구는 시도+시군구 복합키로 충돌 방지
      region_code = `${c1}|${c2}`
      region_name = c2_nm ? (c1_nm ? `${c1_nm} ${c2_nm}` : c2_nm) : (c1_nm || '(C2)')
    } else if (regionKey === 'C3') {
      region_code = `${c1}|${c2}|${c3}`
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

  // 중복 제거 (UPSERT 충돌 방지)
  const dedup = new Map<string, KosisNormalizedRow>()
  for (const row of rows) {
    const key = `${row.org_id}|${row.tbl_id}|${row.prd_de}|${row.region_code}|${row.itm_id}`
    dedup.set(key, row)
  }
  return Array.from(dedup.values())
}
