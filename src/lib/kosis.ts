/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/kosis.ts
/* KOSIS 호출 + 정규화 유틸 (데이터/메타/파라미터 공통) + 디버그 진단 강화 */

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

function toNumberSafe(v?: string): number {
  if (!v) return 0
  const t = v.trim()
  if (!t || t === '-' || t === '.') return 0
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

const RAW_API_KEY = process.env.KOSIS_API_KEY ?? ''
const API_KEY = RAW_API_KEY.trim()

const KOSIS_DATA_BASE =
  'https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList'

const KOSIS_META_ENDPOINTS = [
  'https://kosis.kr/openapi/statisticsData.do?method=getMeta',
  'https://kosis.kr/openapi/Param/statisticsData.do?method=getMeta',
] as const

const KOSIS_PARAM_ENDPOINTS = [
  'https://kosis.kr/openapi/Param/statisticsParameter.do?method=getList',
  'https://kosis.kr/openapi/statisticsParameter.do?method=getList',
  'https://kosis.kr/openapi/ParameterList/statisticsParameterList.do',
] as const

const DEFAULT_HEADERS: HeadersInit = {
  'User-Agent': 'minimisreal/1.0 (+https://minimisreal.vercel.app)',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: 'https://kosis.kr/openapi/',
}

// 텍스트를 느슨히 JSON으로 시도 파싱 + 미리보기 보존
async function tryFetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, redirect: 'follow', cache: 'no-store' })
  const text = await res.text()
  const preview = text.slice(0, 500)
  return {
    ok: res.ok,
    status: res.status,
    url,
    textPreview: preview,
    parsed: (() => {
      const trimmed = text.trim()
      if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) return null
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try { return JSON.parse(trimmed) } catch {}
      }
      if (/^\s*\{/.test(trimmed)) {
        try {
          const fixed = trimmed
            .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
            .replace(/:\s*'([^']*)'/g, ':"$1"')
          return JSON.parse(fixed)
        } catch {}
      }
      return null
    })(),
  }
}

// ---------- 데이터 조회 ----------
export type KosisParamDataParams = {
  orgId: string
  tblId: string
  prdSe: 'Y' | 'H' | 'Q' | 'M' | 'D' | 'IR' | 'F' | 'S'
  startPrdDe?: string
  endPrdDe?: string
  itmId?: string
  // 단일/복수 objL 지원
  objL?: string
  objL1?: string
  objL2?: string
  objL3?: string
  objL4?: string
  objL5?: string
  objL6?: string
  objL7?: string
  objL8?: string
  // 선택 파라미터
  newEstPrdCnt?: string
  format?: 'json'
}

// URLSearchParams는 공백을 '+'로 인코딩하므로,
// 사용자가 '코드1+코드2+' 혹은 '코드1 코드2'로 넘겨도 괜찮게 정규화
function normalizeListParam(v?: string | null): string | undefined {
  if (!v) return undefined
  const s = v.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return undefined
  return s
}

async function _fetchKosisParamData(p: KosisParamDataParams): Promise<KosisRawRow[]> {
  if (!API_KEY) throw new Error('Missing KOSIS_API_KEY')

  const url = new URL(KOSIS_DATA_BASE)
  url.searchParams.set('apiKey', API_KEY)
  url.searchParams.set('format', p.format ?? 'json')
  url.searchParams.set('jsonVD', 'Y')
  url.searchParams.set('_', Date.now().toString())

  url.searchParams.set('orgId', p.orgId)
  url.searchParams.set('tblId', p.tblId)
  url.searchParams.set('prdSe', p.prdSe)
  if (p.startPrdDe) url.searchParams.set('startPrdDe', p.startPrdDe)
  if (p.endPrdDe) url.searchParams.set('endPrdDe', p.endPrdDe)

  // ❗️itmId/objL* 는 "정확한 코드 목록" 필요. ALL 쓰면 표에 따라 실패함.
  if (p.itmId) url.searchParams.set('itmId', normalizeListParam(p.itmId)!)
  if (p.objL)  url.searchParams.set('objL',  normalizeListParam(p.objL)!)
  if (p.objL1) url.searchParams.set('objL1', normalizeListParam(p.objL1)!)
  if (p.objL2) url.searchParams.set('objL2', normalizeListParam(p.objL2)!)
  if (p.objL3) url.searchParams.set('objL3', normalizeListParam(p.objL3)!)
  if (p.objL4) url.searchParams.set('objL4', normalizeListParam(p.objL4)!)
  if (p.objL5) url.searchParams.set('objL5', normalizeListParam(p.objL5)!)
  if (p.objL6) url.searchParams.set('objL6', normalizeListParam(p.objL6)!)
  if (p.objL7) url.searchParams.set('objL7', normalizeListParam(p.objL7)!)
  if (p.objL8) url.searchParams.set('objL8', normalizeListParam(p.objL8)!)
  if (p.newEstPrdCnt) url.searchParams.set('newEstPrdCnt', p.newEstPrdCnt)

  const trial = await tryFetchJson(url.toString(), { headers: DEFAULT_HEADERS })
  if (!trial.ok) {
    throw new Error(`HTTP ${trial.status} @getList :: ${trial.url} :: ${trial.textPreview}`)
  }

  const parsed = trial.parsed
  if (Array.isArray(parsed)) return parsed as KosisRawRow[]
  const errObj = parsed as { err?: string; errMsg?: string } | undefined
  if (errObj?.err || errObj?.errMsg) {
    throw new Error(`KOSIS error ${errObj.err ?? ''}: ${errObj.errMsg ?? 'unknown'}`)
  }
  throw new Error(`KOSIS returned non-array @getList :: ${trial.url} :: ${trial.textPreview}`)
}

export async function fetchKosisData(p: KosisParamDataParams): Promise<KosisRawRow[]> {
  return _fetchKosisParamData(p)
}

// ---------- 메타/파라미터(진단) ----------
export async function fetchKosisTableMeta(
  orgId: string, tblId: string
): Promise<{ meta: unknown | null; diagnostics: any[] }> {
  const diagnostics: any[] = []
  if (!API_KEY) return { meta: null, diagnostics: [{ error: 'Missing KOSIS_API_KEY' }] }

  for (const base of KOSIS_META_ENDPOINTS) {
    const u = new URL(base)
    u.searchParams.set('apiKey', API_KEY)
    u.searchParams.set('format', 'json')
    u.searchParams.set('jsonVD', 'Y')
    u.searchParams.set('type', 'TBL')
    u.searchParams.set('orgId', orgId)
    u.searchParams.set('tblId', tblId)
    u.searchParams.set('_', Date.now().toString())

    const trial = await tryFetchJson(u.toString(), { headers: DEFAULT_HEADERS })
    diagnostics.push({
      endpoint: base, status: trial.status, url: trial.url,
      textPreview: trial.textPreview, parsedType: Array.isArray(trial.parsed) ? 'array' : typeof trial.parsed,
    })
    if (trial.ok && trial.parsed != null) return { meta: trial.parsed, diagnostics }
  }
  return { meta: null, diagnostics }
}

export async function fetchKosisParameters(
  orgId: string, tblId: string
): Promise<{ payload: unknown | null; diagnostics: any[] }> {
  const diagnostics: any[] = []
  if (!API_KEY) return { payload: null, diagnostics: [{ error: 'Missing KOSIS_API_KEY' }] }

  for (const base of KOSIS_PARAM_ENDPOINTS) {
    const u = new URL(base)
    u.searchParams.set('apiKey', API_KEY)
    u.searchParams.set('format', 'json')
    u.searchParams.set('jsonVD', 'Y')
    u.searchParams.set('orgId', orgId)
    u.searchParams.set('tblId', tblId)
    u.searchParams.set('_', Date.now().toString())
    const trial = await tryFetchJson(u.toString(), { headers: DEFAULT_HEADERS })
    diagnostics.push({
      endpoint: base, status: trial.status, url: trial.url,
      textPreview: trial.textPreview, parsedType: Array.isArray(trial.parsed) ? 'array' : typeof trial.parsed,
    })
    if (trial.ok && trial.parsed != null) {
      const parsed = trial.parsed
      const payload = Array.isArray(parsed) ? parsed : (parsed as any)?.list ?? (parsed as any)?.LIST ?? parsed
      return { payload, diagnostics }
    }
  }
  return { payload: null, diagnostics }
}

// ---------- 파라미터 payload 정규화 (메타 페이지/빌더에서 사용) ----------
/** KOSIS 파라미터 응답의 다양한 포맷을 최대한 평탄화해서 돌려줍니다. */
export function normalizeParameterPayload(payload: unknown): unknown {
  if (payload == null) return null
  if (Array.isArray(payload)) return payload
  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (Array.isArray(obj.list)) return obj.list
    if (Array.isArray((obj as any).LIST)) return (obj as any).LIST
    return obj
  }
  return payload
}

// ---------- 데이터 정규화 ----------
export function normalizeKosisRows(
  rawRows: KosisRawRow[],
  opts: NormalizeOptions
): KosisNormalizedRow[] {
  const { orgId, tblId, regionKey } = opts

  const rows: KosisNormalizedRow[] = rawRows.map((r) => {
    const prd_se = r.PRD_SE ?? ''
    const prd_de = r.PRD_DE ?? ''
    const itm_id = (r.ITM_ID ?? '').trim()
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
      region_code = `${c1}|${c2}`
      region_name = c2_nm ? (c1_nm ? `${c1_nm} ${c2_nm}` : c2_nm) : (c1_nm || '(C2)')
    } else if (regionKey === 'C3') {
      region_code = `${c1}|${c2}|${c3}`
      region_name = [c1_nm, c2_nm, c3_nm].filter(Boolean).join(' ')
    } else {
      const ck = r[regionKey] ?? ''
      const ckn = (r as any)[`${regionKey}_NM`] ?? ''
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
