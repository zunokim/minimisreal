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

  // 1) 키에 따옴표가 없는 패턴: { key: ... } 또는 , key: ...
  //   → { "key": ... } 로 보정
  s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')

  // 2) 마지막 요소 뒤의 불필요한 쉼표 제거: ,]  ,}
  s = s.replace(/,\s*([}\]])/g, '$1')

  // 3) BOM/제어문자 제거(혹시 몰라서)
  s = s.replace(/^\uFEFF/, '')

  return s
}

/** 안전한 JSON 파서: 실패 시 보정 시도 후 다시 파싱 */
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
    // 2차: 느슨한 JSON 보정 후 재시도
    try {
      const repaired = repairLooseJson(text)
      return JSON.parse(repaired)
    } catch {
      const snippet = text.slice(0, 400)
      throw new Error(`KOSIS returned non-JSON. Preview: ${snippet}`)
    }
  }
}

/**
 * 1) 메타(구조) 조회
 * - 표의 항목/지역 코드, 주기 등을 확인
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
 * 2) 데이터 조회(파라미터 방식)
 * - 예: prdSe=M, startPrdDe=202201, endPrdDe=202507, itmId=ALL, objL1=11000 ...
 */
export async function fetchKosisData(params: Record<string, string>) {
  const url = new URL(`${BASE}/Param/statisticsParameterData.do`)
  url.searchParams.set('method', 'getList')
  url.searchParams.set('apiKey', API_KEY)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  if (!url.searchParams.get('format')) url.searchParams.set('format', 'json')
  return getJsonSafely(url)
}

/**
 * 3) 응답을 DB에 넣기 쉬운 모양으로 변환(정규화)
 * - regionKey: 'C1' | 'C2' | 'C3' (표마다 지역 키가 다를 수 있음)
 */
export function normalizeKosisRows(
  rows: KosisApiRow[],
  opts: { orgId: string; tblId: string; regionKey?: 'C1' | 'C2' | 'C3' }
) {
  const regionKey = opts.regionKey ?? 'C1'
  const regionNameKey = `${regionKey}_NM`

  return (rows ?? []).map((r) => {
    const region_code =
      typeof r[regionKey] === 'string' ? (r[regionKey] as string) : ''
    const region_name =
      typeof r[regionNameKey] === 'string' ? (r[regionNameKey] as string) : null

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
