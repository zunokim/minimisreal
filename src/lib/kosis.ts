// src/lib/kosis.ts
/* KOSIS 호출 + 정규화 유틸 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

/** KOSIS 데이터 한 행(키가 유동적이라 문자열 인덱스 허용) */
export type KosisRawRow = Record<string, string | undefined>

export interface NormalizeOptions {
  orgId: string
  tblId: string
  /** C1(시도) | C2(시군구) | C3(동/읍/면) … */
  regionKey: 'C1' | 'C2' | 'C3' | string
}

/** 안전한 숫자 파서 (빈문자/'-'/'.' 등은 0 처리) */
function toNumberSafe(v: string | undefined): number {
  if (!v) return 0
  const t = v.trim()
  if (!t || t === '-' || t === '.') return 0
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** 환경변수 키 트림 (앞뒤 공백 방지) */
const RAW_API_KEY = process.env.KOSIS_API_KEY ?? ''
const API_KEY = RAW_API_KEY.trim()
if (!API_KEY) {
  console.warn('⚠️ Missing KOSIS_API_KEY')
}

/** KOSIS 기본 엔드포인트 */
const KOSIS_DATA_BASE =
  'https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList'

const KOSIS_META_BASE =
  'https://kosis.kr/openapi/Param/statisticsParameterMeta.do?method=getMeta'

const DEFAULT_HEADERS = {
  // 일부 환경에서 UA 없으면 HTML 페이지가 반환되는 경우가 있어 명시
  'User-Agent': 'minimisreal/1.0 (+https://minimisreal.vercel.app)',
}

/** 느슨한 JSON 파서: {TBL_NM:"..."} 같은 비표준도 수용 */
function parseLooseJson(text: string): unknown {
  const trimmed = text.trim()

  // HTML(오류 페이지 등)일 경우 바로 에러
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    throw new Error(`Non-JSON response. Preview: ${trimmed.slice(0, 200)}`)
  }

  // 정상 JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return JSON.parse(trimmed)
  }

  // 비표준 포맷 (예: {TBL_NM:"..."})
  if (/^\{\s*[A-Za-z0-9_]+\s*:/m.test(trimmed)) {
    const fixed = trimmed
      .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":') // 키에 쌍따옴표
      .replace(/:\s*'([^']*)'/g, ':"$1"') // 값에 홑따옴표 → 쌍따옴표
    return JSON.parse(fixed)
  }

  // 그래도 아니면 파싱 실패
  throw new Error(`Non-JSON response. Preview: ${trimmed.slice(0, 200)}`)
}

/**
 * KOSIS 데이터 호출
 * - params: orgId, tblId, prdSe, startPrdDe/endPrdDe 또는 newEstPrdCnt, itmId, objL1~objL8/objL, format=json
 */
export async function fetchKosisData(
  params: Record<string, string>
): Promise<KosisRawRow[]> {
  const url = new URL(KOSIS_DATA_BASE)
  url.searchParams.set('apiKey', API_KEY)
  // 데이터 API는 원래도 json 파라미터를 붙였지만 혹시 모르니 보강
  url.searchParams.set('format', 'json')
  url.searchParams.set('jsonVD', 'Y') // 가능한 경우 유효 JSON 강제
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), { cache: 'no-store', headers: DEFAULT_HEADERS })
  const txt = await res.text()

  // 표준/비표준 모두 허용
  const parsed = parseLooseJson(txt)

  // 배열일 때만 정상 데이터로 취급
  if (Array.isArray(parsed)) {
    return parsed as KosisRawRow[]
  }

  // 에러 오브젝트 형태면 메시지로 전달
  try {
    const obj = parsed as { err?: string; errMsg?: string }
    if (obj && (obj.err || obj.errMsg)) {
      throw new Error(`KOSIS error ${obj.err ?? ''}: ${obj.errMsg ?? 'unknown'}`)
    }
  } catch {
    /* noop */
  }

  throw new Error(`KOSIS returned non-array. Preview: ${txt.slice(0, 200)}`)
}

/** 메타 조회 (TBL / OBJ / ITM) */
export async function fetchKosisMeta(
  params: { orgId: string; tblId: string; type?: string }
): Promise<unknown> {
  const url = new URL(KOSIS_META_BASE)
  url.searchParams.set('apiKey', API_KEY)
  url.searchParams.set('format', 'json') // ✅ JSON 강제
  url.searchParams.set('jsonVD', 'Y')    // ✅ 유효 JSON(키에 따옴표)
  url.searchParams.set('orgId', params.orgId)
  url.searchParams.set('tblId', params.tblId)
  if (params.type) url.searchParams.set('type', params.type)

  const res = await fetch(url.toString(), { cache: 'no-store', headers: DEFAULT_HEADERS })
  const txt = await res.text()

  // 메타는 배열/객체/비표준/HTML 가능 → 느슨 파서 사용 (HTML이면 위에서 에러)
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

/**
 * 정규화
 * - C1: region_code = row.C1
 * - C2: region_code = `${row.C1}|${row.C2}`  ← ⚠️ 시군구 ‘계’ 중복 충돌 방지
 * - C3 이상: `${C1}|${C2}|${C3}` … (필요 시 확장)
 * - 입력 내부 중복 제거: 동일 (org_id,tbl_id,prd_de,region_code,itm_id) 키가 2번 오면 마지막만 유지
 */
export function normalizeKosisRows(
  rawRows: KosisRawRow[],
  opts: NormalizeOptions
): KosisNormalizedRow[] {
  const { orgId, tblId, regionKey } = opts

  const rows: KosisNormalizedRow[] = rawRows.map((r) => {
    const prd_se = r.PRD_SE ?? ''
    const prd_de = r.PRD_DE ?? ''

    // 아이템(항목)
    const itm_id = (r.ITM_ID ?? 'ALL').trim()
    const itm_name = (r.ITM_NM ?? '항목').trim()

    // 단위
    const unit = (r.UNIT_NM ?? '').trim()

    // 값
    const value = toNumberSafe(r.DT)

    // 지역 코드/이름 구성
    let region_code = ''
    let region_name = ''

    const c1 = r['C1'] ?? ''
    const c1_nm = r['C1_NM'] ?? ''
    const c2 = r['C2'] ?? ''
    const c2_nm = r['C2_NM'] ?? ''
    const c3 = r['C3'] ?? ''
    const c3_nm = r['C3_NM'] ?? ''

    if (regionKey === 'C1') {
      region_code = c1
      region_name = c1_nm || c1 || '(C1)'
    } else if (regionKey === 'C2') {
      // ⚠️ 충돌 방지: C1 + C2 복합
      region_code = `${c1}|${c2}`.trim()
      region_name = c2_nm ? (c1_nm ? `${c1_nm} ${c2_nm}` : c2_nm) : (c1_nm || '(C2)')
    } else if (regionKey === 'C3') {
      region_code = `${c1}|${c2}|${c3}`.trim()
      region_name = [c1_nm, c2_nm, c3_nm].filter(Boolean).join(' ')
    } else {
      // 기타 키가 오면 해당 키 그대로 사용 시도
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

  // 입력 내부 중복 제거
  const dedup = new Map<string, KosisNormalizedRow>()
  for (const row of rows) {
    const key = `${row.org_id}|${row.tbl_id}|${row.prd_de}|${row.region_code}|${row.itm_id}`
    dedup.set(key, row)
  }

  return Array.from(dedup.values())
}
