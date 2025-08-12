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
  [key: string]: unknown
}

/** 느슨한(JSON 같지만 규칙 어긴) 응답을 JSON으로 보정 */
function repairLooseJson(text: string): string {
  let s = text.trim()
  // 1) 키에 따옴표가 없는 패턴 보정: { key: ... } 또는 , key: ...
  s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
  // 2) 마지막 요소 뒤 쉼표 제거
  s = s.replace(/,\s*([}\]])/g, '$1')
  // 3) BOM 제거
  s = s.replace(/^\uFEFF/, '')
  return s
}

/** 텍스트 → JSON 파싱(실패 시 원문/보정본 스니펫 제공) */
async function getJsonSafely(url: URL) {
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
  // a) 이미 배열이면 OK
  if (Array.isArray(payload)) return payload

  // b) 에러 포맷 처리
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>

    // 공통 에러 포맷
    if (typeof obj.err === 'string') {
      const code = obj.err
      const msg = typeof obj.errMsg === 'string' ? obj.errMsg : ''
      throw new Error(`KOSIS error ${code}: ${msg}`)
    }

    // 자주 보이는 배열 키 후보들 중 첫 번째 배열을 채택
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
    ]
    for (const key of Object.keys(obj)) {
      const v = obj[key]
      if (Array.isArray(v)) return v
    }
    for (const key of candidates) {
      const v = (obj as any)[key]
      if (Array.isArray(v)) return v
    }

    // 객체 안에 배열이 하나도 없다면 예상치 못한 포맷
    const keysPreview = Object.keys(obj).join(',')
    throw new Error(`KOSIS data: expected array but got object with keys: [${keysPreview}]`)
  }

  // c) 문자열로 온 경우 다시 파싱 시도
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
        throw new Error(`KOSIS data: unexpected string payload (cannot parse)`)
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
}) {
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

  // 혹시 배열이 아닌 게 들어와도 방어
  const list = Array.isArray(rows) ? rows : []

  return list.map((r) => {
    const region_code =
      typeof (r as any)[regionKey] === 'string' ? ((r as any)[regionKey] as string) : ''
    const region_name =
      typeof (r as any)[regionNameKey] === 'string' ? ((r as any)[regionNameKey] as string) : null

    const value =
      r.DT === null || r.DT === undefined || r.DT === '' ? null : Number(r.DT)

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
