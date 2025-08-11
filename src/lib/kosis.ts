// src/lib/kosis.ts
const BASE = 'https://kosis.kr/openapi'

const API_KEY = process.env.KOSIS_API_KEY!
if (!API_KEY) {
  throw new Error('Missing KOSIS_API_KEY')
}

/**
 * KOSIS 메타 조회 (분류/항목/주기 등 구조 확인)
 */
export async function fetchKosisMeta(params: {
  orgId: string
  tblId: string
  type?: 'TBL' | 'ITM' | 'OBJ' // 기본 TBL
  format?: 'json' | 'xml'
}) {
  const url = new URL(`${BASE}/statisticsData.do`)
  url.searchParams.set('method', 'getMeta')
  url.searchParams.set('apiKey', API_KEY)
  url.searchParams.set('type', params.type ?? 'TBL')
  url.searchParams.set('orgId', params.orgId)
  url.searchParams.set('tblId', params.tblId)
  url.searchParams.set('format', params.format ?? 'json')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`KOSIS meta error: ${res.status}`)
  return res.json()
}

/**
 * KOSIS 데이터 조회 (파라미터 방식)
 * 예: prdSe=M, startPrdDe=202001, endPrdDe=202507, itmId=ALL, objL1=11000 ...
 */
export async function fetchKosisData(params: Record<string, string>) {
  const url = new URL(`${BASE}/Param/statisticsParameterData.do`)
  url.searchParams.set('method', 'getList')
  url.searchParams.set('apiKey', API_KEY)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  // 기본 json
  if (!url.searchParams.get('format')) url.searchParams.set('format', 'json')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`KOSIS data error: ${res.status}`)
  return res.json()
}

/**
 * 응답 → 공통 레코드로 정규화
 * KOSIS 응답 예시 필드: PRD_SE, PRD_DE, ITM_ID, ITM_NM, UNIT_NM, C1, C1_NM, ... DT
 */
export function normalizeKosisRows(
  rows: any[],
  opts: { orgId: string; tblId: string; regionKey?: 'C1' | 'C2' | 'C3' }
) {
  const regionKey = opts.regionKey ?? 'C1'
  const regionNameKey = `${regionKey}_NM`

  return (rows ?? []).map((r) => ({
    org_id: opts.orgId,
    tbl_id: opts.tblId,
    prd_se: r.PRD_SE ?? '',
    prd_de: r.PRD_DE ?? '',
    region_code: r[regionKey] ?? '',
    region_name: r[regionNameKey] ?? null,
    itm_id: r.ITM_ID ?? '',
    itm_name: r.ITM_NM ?? null,
    unit: r.UNIT_NM ?? null,
    value: r.DT ? Number(r.DT) : null,
    raw: r
  }))
}
