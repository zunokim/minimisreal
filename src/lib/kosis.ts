// src/lib/kosis.ts
const BASE = 'https://kosis.kr/openapi'

const API_KEY = process.env.KOSIS_API_KEY!
if (!API_KEY) {
  throw new Error('Missing KOSIS_API_KEY')
}

export type KosisApiRow = {
  PRD_SE?: string
  PRD_DE?: string
  ITM_ID?: string
  ITM_NM?: string
  UNIT_NM?: string
  DT?: string | number
  [key: string]: unknown // 인덱스 시그니처(OBJ 레벨 C1/C2 등 접근용)
}

/** 문자열이면 그대로, 아니면 null */
function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/** 객체 안전 접근 */
function get(obj: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined
}

/** 느슨한(JSON 같지만 규칙 어긴) 응답을 JSON으로 보정 */
function repairLooseJson(text: string): string {
  let s = text.trim()
  // 1) 키 따옴표 보정: { key: ... } 또는 , key: ... -> "key"
  s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
  // 2) 마지막 요소 뒤의 불필요한 쉼표 제거: ,]  ,}
  s = s.replace(/,\s*([}\]])/g, '$1')
  // 3) BOM 제거
  s = s.replace(/^\uFEFF/, '')
  return s
}

/** 텍스트 → JSON 파싱(실패 시 원문/보정본 스니펫 제공) */
async function getJsonSafely(url: URL): Promise<unknown> {
  const res = await fetch(url.toString())
  const text = await res.text()

  if (!res.ok) {
    const snippet = text.slice(0, 400)
    throw new Error(`KOSIS HTTP ${res.status}: ${snippet}`)
  }

  // 1차: 그대로 파싱
  try {
    return JSON.parse(text)
  } catch {
    // 2차: 보정 후 재시도
    try {
      const repaired = repairLooseJson(text)
      return JSON.parse(repaired)
    } catch {
      const snippet = text.slice(0, 400)
      throw new Error(`KOSIS returned non-JSON. Preview: ${snippet}`)
    }
  }
}

/** KOSIS 응답을 "반드시 배열"로 풀어주는 언래퍼 */
function unwrapToArray(payload: unknown): unknown[] {
  // a) 이미 배열
  if (Array.isArray(payload)) return payload

  // b) 객체: 에러/후보키 검사
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>

    // 표준 에러 포맷 처리
    const errCode = asString(get(obj, 'err'))
    if (errCode) {
      const msg = asString(get(obj, 'errMsg')) ?? ''
      throw new Error(`KOSIS error ${errCode}: ${msg}`)
    }

    // 객체 내 존재하는 배열을 우선 사용
    for (const key of Object.keys(obj)) {
      const v = obj[key]
      if (Array.isArray(v)) return v as unknown[]
    }

    // 후보 키들 재확인(대/소문자 혼용 대비)
    const candidates = [
      'StatisticSearch',
      'statisticSearch',
      'data',
      'DATA',
      'list',
      'List',
      'items',
      'ITEMS',
      'result',
      'results',
      'return',
      'value',
    ] as const

    for (const key of candidates) {
      const v = get(obj, key)
      if (Array.isArray(v)) return v as unknown[]
    }

    const keysPreview = Object.keys(obj).join(',')
    throw new Error(`KOSIS data: expected array but got object with keys: [${keysPreview}]`)
  }

  // c) 문자열: 재파싱 시도
  if (typeof payload === 'string') {
    try {
      const j = JSON.parse(payload)
      return unwrapToArray(j)
    } catch {
      const repaired = repairLooseJson(payload)
      try {
        const j2 = JSON.parse(repaired)
        return unwrapToArray(j2)
      } catch {
        throw new Error('KOSIS data: unexpected string payload (cannot parse)')
      }
    }
  }

  // d) 그 외 타입
  throw new Error(`KOSIS data: unsupported payload type: ${typeof payload}`)
}

/**
 * 1) 메타(구조) 조회
 */
export async function fetchKosisMeta(params: {
  orgId: string
  tblId: string
  type?: 'TBL' | 'ITM' | 'OBJ'
  format?: 'json' | 'xml'
}): Promise<unknown> {
  const url = new URL(`${BASE}/statisticsData.do`)
  url.searchParams.set('method', 'getMeta')
  url.searchParams.set('apiKey', API_KEY)
  url.searchParams.set('type', params.type ?? 'TBL')
  url.searchParams.set('orgId', params.orgId)
  url.searchParams.set('tblId', params.tblId)
  url.searchParams.set('format', params.format ?? 'json')
  return getJsonSafely(url)
}

/**
 * 2) 실제 데이터 조회(파라미터 방식)
 *  - 항상 "배열"로 반환되도록 언래핑
 */
export async function fetchKosisData(params: Record<string, string>): Promise<KosisApiRow[]> {
  const url = new URL(`${BASE}/Param/statisticsParameterData.do`)
  url.searchParams.set('method', 'getList')
  url.searchParams.set('apiKey', API_KEY)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  if (!url.searchParams.get('format')) url.searchParams.set('format', 'json')

  const payload = await getJsonSafely(url)
  const arr = unwrapToArray(payload)
  return arr as KosisApiRow[]
}

/**
 * 3) 응답을 DB에 넣기 쉬운 모양으로 변환(정규화)
 *  - regionKey: 'C1' | 'C2' | 'C3'
 */
export function normalizeKosisRows(
  rows: KosisApiRow[],
  opts: { orgId: string; tblId: string; regionKey?: 'C1' | 'C2' | 'C3' }
) {
  const regionKey = opts.regionKey ?? 'C1'
  const regionNameKey = `${regionKey}_NM`

  const list: KosisApiRow[] = Array.isArray(rows) ? rows : []

  return list.map((r) => {
    const region_code = asString(get(r, regionKey as string)) ?? ''
    const region_name = asString(get(r, regionNameKey))

    let value: number | null
    if (r.DT === null || r.DT === undefined || r.DT === '') {
      value = null
    } else if (typeof r.DT === 'number') {
      value = r.DT
    } else if (typeof r.DT === 'string') {
      const n = Number(r.DT)
      value = Number.isFinite(n) ? n : null
    } else {
      value = null
    }

    return {
      org_id: opts.orgId,
      tbl_id: opts.tblId,
      prd_se: r.PRD_SE ?? '',
      prd_de: r.PRD_DE ?? '',
      region_code,
      region_name,
      itm_id: r.ITM_ID ?? '',
      itm_name: (r.ITM_NM as string) ?? null,
      unit: (r.UNIT_NM as string) ?? null,
      value,
      raw: r,
    }
  })
}
