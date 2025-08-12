// src/lib/kosis.ts
/* KOSIS 호출 + 정규화 유틸 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

export type KosisRawRow = Record<string, string>

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
  // 서버 기동 시 바로 에러
  // (로컬/프로드 둘 다 필요)
  console.warn('⚠️ Missing KOSIS_API_KEY')
}

/** KOSIS 기본 엔드포인트 */
const KOSIS_BASE =
  'https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList'

/**
 * KOSIS 데이터 호출
 * - params: orgId, tblId, prdSe, startPrdDe/endPrdDe 또는 newEstPrdCnt, itmId, objL1~objL8/objL, format=json
 */
export async function fetchKosisData(
  params: Record<string, string>
): Promise<KosisRawRow[]> {
  const url = new URL(KOSIS_BASE)
  // 필수
  url.searchParams.set('apiKey', API_KEY)
  // 사용자 전달 파라미터
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    // KOSIS는 종종 캐시가 걸려서 최신이 늦게 보일 수 있어요
    // 여기서는 네트워크 우선
    cache: 'no-store',
  })

  const txt = await res.text()

  // 정상 JSON 배열: [ {...}, {...} ]
  if (txt.trim().startsWith('[')) {
    try {
      const json = JSON.parse(txt) as KosisRawRow[]
      return json
    } catch (e) {
      throw new Error(`KOSIS JSON parse error: ${String(e)}\nPreview: ${txt.slice(0, 200)}`)
    }
  }

  // 에러 오브젝트: {"err":"..","errMsg":".."}
  if (txt.trim().startsWith('{')) {
    try {
      const obj = JSON.parse(txt) as { err?: string; errMsg?: string }
      throw new Error(`KOSIS error ${obj.err ?? ''}: ${obj.errMsg ?? 'unknown'}`)
    } catch {
      // 진짜 JSON 아니면 아래로
    }
  }

  // 비표준 포맷 (예: {TBL_NM:"..."}) → 최소한의 파싱
  if (/^\{\s*[A-Za-z0-9_]+\s*:/m.test(txt)) {
    // 간이 변환: key: "val" 형태로 바꾸기
    const fixed = txt
      .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*)'/g, ':"$1"')
    try {
      const json = JSON.parse(fixed)
      // 메타 응답 등은 여기로 들어오므로 빈 배열 반환
      return Array.isArray(json) ? (json as KosisRawRow[]) : []
    } catch {
      throw new Error(`KOSIS returned non-JSON. Preview: ${txt.slice(0, 200)}`)
    }
  }

  throw new Error(`KOSIS unexpected response. HTTP ${res.status}. Preview: ${txt.slice(0, 200)}`)
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
 * - C2: region_code = `${row.C1}|${row.C2}`  ← ⚠️ 충돌 방지 (시도+시군구 복합키)
 * - C3 이상도 동일한 규칙으로 확장 가능 (C1|C2|C3 ...)
 * - 중복 방지: 동일 (org_id,tbl_id,prd_de,region_code,itm_id) 키가 입력에 2번 오면 1개만 남김
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

    const c1 = r.C1 ?? ''
    const c1_nm = r.C1_NM ?? ''
    const c2 = r.C2 ?? ''
    const c2_nm = r.C2_NM ?? ''
    const c3 = (r as any).C3 ?? ''
    const c3_nm = (r as any).C3_NM ?? ''

    if (regionKey === 'C1') {
      region_code = c1
      region_name = c1_nm || c1 || '(C1)'
    } else if (regionKey === 'C2') {
      // ⚠️ 충돌 방지: C1 + C2 복합
      region_code = `${c1}|${c2}`.trim()
      region_name = (c1_nm && c2_nm) ? `${c1_nm} ${c2_nm}` : (c2_nm || c1_nm || '(C2)')
    } else if (regionKey === 'C3') {
      // 필요 시 확장
      region_code = `${c1}|${c2}|${c3}`.trim()
      region_name = [c1_nm, c2_nm, c3_nm].filter(Boolean).join(' ')
    } else {
      // 기타 키가 오면 해당 키 그대로 사용 시도
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
      raw: r as unknown as JsonValue,
    }
  })

  // 입력 내부 중복 제거 (같은 키가 2번 오면 마지막 값만 유지)
  const dedup = new Map<string, KosisNormalizedRow>()
  for (const row of rows) {
    const key = `${row.org_id}|${row.tbl_id}|${row.prd_de}|${row.region_code}|${row.itm_id}`
    dedup.set(key, row)
  }

  return Array.from(dedup.values())
}
