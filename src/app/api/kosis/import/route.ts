// src/app/api/kosis/import/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required environment variable: ${name}`)
  return v
}
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, '').trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}
function incMonth(yyyymm: string): string {
  const y = Number(yyyymm.slice(0, 4))
  const m = Number(yyyymm.slice(4))
  const d = new Date(y, m - 1 + 1, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthRange(start: string, end: string): string[] {
  if (!/^\d{6}$/.test(start) || !/^\d{6}$/.test(end)) return []
  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    cur = incMonth(cur)
  }
  return out
}

/** KOSIS 표준 응답(실데이터) 형태 */
interface KosisRow {
  ORG_ID?: string
  TBL_ID?: string
  PRD_SE?: string
  PRD_DE?: string
  ITM_ID?: string
  ITM_NM?: string
  UNIT_NM?: string
  DT?: string | number
  C1?: string
  C1_NM?: string
  C2?: string
  C2_NM?: string
  // 확장 파라미터가 올 수 있으나, 여기서는 사용하지 않음
  [key: string]: unknown
}

/** KOSIS 에러 응답 형태 */
interface KosisErrorBody {
  errCd?: string
  errMsg?: string
  [key: string]: unknown
}

type DatasetKey = 'hcsi' | 'unsold' | 'unsold_after'

const DEFAULTS = {
  hcsi: { orgId: '390', tblId: 'DT_39002_02', prdSe: 'M', itmId: 'ALL', objL1: 'ALL', regionKey: 'C1' as const },
  unsold: { orgId: '101', tblId: 'DT_1YL202004E', prdSe: 'M', itmId: 'ALL', objL1: 'ALL', objL2: 'ALL', regionKey: 'C2' as const },
  unsold_after: { orgId: '116', tblId: 'DT_MLTM_5328', prdSe: 'M', regionKey: 'C2' as const },
}

/** 행 단위로 C2/C1 중 존재하는 지역코드/이름을 안전하게 선택 */
function pickRegion(r: KosisRow, prefer: 'C1' | 'C2'): { code: string; name: string | null } {
  const order = prefer === 'C2' ? (['C2', 'C1'] as const) : (['C1', 'C2'] as const)
  for (const key of order) {
    const code = (r as Record<string, unknown>)[key]
    const name = (r as Record<string, unknown>)[`${key}_NM`]
    if (typeof code === 'string' && code !== '') {
      return { code, name: typeof name === 'string' ? name : null }
    }
  }
  return { code: '000', name: null }
}

/** Supabase에 넣을 공통 Row */
interface CommonDbRow {
  org_id: string
  tbl_id: string
  prd_se: string
  prd_de: string
  region_code: string
  region_name: string | null
  itm_id: string
  itm_name: string | null
  unit: string | null
  value: number | null
}

/** kosis_unsold_after용 Row (upsert) */
interface UnsoldAfterDbRow extends CommonDbRow {
  inserted_at: string
  updated_at: string
}

/** hcsi/unsold용 Row (insert dedupe) */
interface NormalDbRow extends CommonDbRow {
  raw: KosisRow
}

type AttemptOk = { scope: string; ok: true; count: number; usedParams: Record<string, string> }
type AttemptFail = { scope: string; ok: false; error: string; usedParams: Record<string, string> }
type Attempt = AttemptOk | AttemptFail

export async function GET(req: NextRequest) {
  try {
    // 보호 헤더
    const need = requireEnv('NEWS_CRON_SECRET')
    const got = req.headers.get('x-job-secret') || req.headers.get('X-Job-Secret')
    if (got !== need) {
      return NextResponse.json({ ok: false, status: 401, message: 'Unauthorized' }, { status: 401 })
    }

    const sp = req.nextUrl.searchParams
    const dataset = (sp.get('dataset') as DatasetKey) || 'hcsi'
    if (!['hcsi', 'unsold', 'unsold_after'].includes(dataset)) {
      return NextResponse.json({ ok: false, status: 400, message: 'invalid dataset' }, { status: 400 })
    }

    const def = DEFAULTS[dataset]
    const orgId = sp.get('orgId') || def.orgId
    const tblId = sp.get('tblId') || def.tblId
    const prdSe = sp.get('prdSe') || def.prdSe
    const startPrdDe = sp.get('startPrdDe') || undefined
    const endPrdDe = sp.get('endPrdDe') || startPrdDe
    const itmId = sp.get('itmId') || (def as { itmId?: string }).itmId || undefined
    const objL1 = sp.get('objL1') || (def as { objL1?: string }).objL1 || undefined
    const objL2 = sp.get('objL2') || (def as { objL2?: string }).objL2 || undefined
    const objL3 = sp.get('objL3') || undefined
    const objL4 = sp.get('objL4') || undefined
    const regionKeyPref = (sp.get('regionKey') as 'C1' | 'C2' | null) || def.regionKey

    if (!startPrdDe) {
      return NextResponse.json({ ok: false, status: 400, message: 'startPrdDe is required (YYYYMM)' }, { status: 400 })
    }

    const months = monthRange(startPrdDe, endPrdDe || startPrdDe)
    if (months.length === 0) {
      return NextResponse.json({ ok: false, status: 400, message: 'Invalid period range' }, { status: 400 })
    }

    const supabase = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))

    const attempts: Attempt[] = []
    let totalInserted = 0
    let totalUpserted = 0
    let totalSkipped = 0

    for (const scope of months) {
      const q = new URLSearchParams()
      q.set('method', 'getList')
      q.set('apiKey', requireEnv('KOSIS_API_KEY'))
      q.set('format', 'json')
      q.set('jsonVD', 'Y')
      q.set('orgId', orgId)
      q.set('tblId', tblId)
      if (prdSe) q.set('prdSe', prdSe)
      q.set('startPrdDe', scope)
      q.set('endPrdDe', scope)
      if (itmId) q.set('itmId', itmId)
      if (objL1) q.set('objL1', objL1)
      if (objL2) q.set('objL2', objL2)
      if (objL3) q.set('objL3', objL3)
      if (objL4) q.set('objL4', objL4)

      const usedParams = Object.fromEntries(q.entries())
      const url = `https://kosis.kr/openapi/Param/statisticsParameterData.do?${q.toString()}`

      // ===== KOSIS 호출 & 파싱 =====
      let bodyText = ''
      let arr: KosisRow[] = []
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
        bodyText = await res.text()

        // 1) HTTP 오류
        if (!res.ok) {
          attempts.push({ scope, ok: false, error: `KOSIS error: HTTP ${res.status}`, usedParams })
          continue
        }

        // 2) 본문 파싱
        const parsed: unknown = JSON.parse(bodyText)

        // 배열이면 정상 데이터
        if (Array.isArray(parsed)) {
          // unknown[] → KosisRow[] 로 옮기기 (필요 키만 사용)
          arr = parsed
            .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
            .map((v) => v as KosisRow)
        } else if (parsed && typeof parsed === 'object') {
          // 에러 포맷인지 확인
          const e = parsed as KosisErrorBody
          if (e.errCd) {
            const code = e.errCd
            const msg = e.errMsg ?? 'Unknown error'
            if (code === '30' || /데이터가 존재하지 않습니다/.test(msg)) {
              // 데이터 없음 → 0건 성공 처리
              attempts.push({ scope, ok: true, count: 0, usedParams })
              continue
            }
            attempts.push({ scope, ok: false, error: `KOSIS error ${code}: ${msg}`, usedParams })
            continue
          }
          // 비정형 객체
          if (JSON.stringify(parsed).includes('데이터가 존재하지 않습니다')) {
            attempts.push({ scope, ok: true, count: 0, usedParams })
            continue
          }
          attempts.push({ scope, ok: false, error: 'KOSIS response parse error', usedParams })
          continue
        } else {
          attempts.push({ scope, ok: false, error: 'KOSIS response parse error', usedParams })
          continue
        }
      } catch (e) {
        attempts.push({ scope, ok: false, error: `KOSIS fetch failed: ${String(e)}`, usedParams })
        continue
      }

      // ===== 맵핑 =====
      const mappedCommon: CommonDbRow[] = arr
        .map((r): CommonDbRow | null => {
          const { code, name } = pickRegion(r, regionKeyPref)
          const prd_de = typeof r.PRD_DE === 'string' ? r.PRD_DE : undefined
          if (!prd_de) return null
          return {
            org_id: r.ORG_ID ?? orgId,
            tbl_id: r.TBL_ID ?? tblId,
            prd_se: r.PRD_SE ?? prdSe,
            prd_de,
            region_code: code,
            region_name: name,
            itm_id: r.ITM_ID ?? (itmId ?? 'ALL'),
            itm_name: r.ITM_NM ?? null,
            unit: r.UNIT_NM ?? null,
            value: toNumber(r.DT),
          }
        })
        .filter((v): v is CommonDbRow => v !== null)

      // ===== DB 저장(월별) =====
      if (dataset === 'unsold_after') {
        const rows: UnsoldAfterDbRow[] = mappedCommon.map((b) => ({
          ...b,
          inserted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))

        const { error } = await supabase.from('kosis_unsold_after').upsert(rows, {
          onConflict: 'tbl_id,itm_id,region_code,prd_de,org_id',
          ignoreDuplicates: false,
        })
        if (error) {
          attempts.push({ scope, ok: false, error: `upsert failed: ${String((error as { message?: string }).message ?? error)}`, usedParams })
          continue
        }
        attempts.push({ scope, ok: true, count: rows.length, usedParams })
        totalUpserted += rows.length
        continue
      }

      const table = dataset === 'hcsi' ? 'kosis_hcsi' : 'kosis_unsold'
      const keyFields = ['org_id', 'tbl_id', 'prd_se', 'prd_de', 'region_code', 'itm_id'] as const

      const prdSet = Array.from(new Set(mappedCommon.map((r) => r.prd_de)))
      const { data: existing, error: exErr } = await supabase
        .from(table)
        .select(keyFields.join(','))
        .in('prd_de', prdSet)
        .eq('org_id', orgId)
        .eq('tbl_id', tblId)

      if (exErr) {
        attempts.push({ scope, ok: false, error: `select failed: ${String((exErr as { message?: string }).message ?? exErr)}`, usedParams })
        continue
      }

      const existSet = new Set(
        (existing as Array<Record<string, string>> | null | undefined)?.map((e) =>
          keyFields.map((k) => e[k]).join('|'),
        ) ?? [],
      )
      const toInsert: NormalDbRow[] = mappedCommon
        .filter((r) => !existSet.has(keyFields.map((k) => r[k]).join('|')))
        .map((r, idx) => {
          // raw는 진단용으로 필요하면 나중에 넣을 수 있으나 여기선 미사용 → 빈 객체로 대체
          const raw: KosisRow = {}
          return { ...r, raw }
        })

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from(table).insert(toInsert)
        if (insErr) {
          attempts.push({ scope, ok: false, error: `insert failed: ${String((insErr as { message?: string }).message ?? insErr)}`, usedParams })
          continue
        }
      }

      attempts.push({ scope, ok: true, count: mappedCommon.length, usedParams })
      totalInserted += toInsert.length
      totalSkipped += mappedCommon.length - toInsert.length
    }

    // 전체 결과 (부분 성공 허용)
    const anySuccess = attempts.some((a) => a.ok && a.count >= 0)
    if (!anySuccess) {
      return NextResponse.json({ ok: false, status: 502, message: 'All attempts failed', attempts }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      status: 200,
      inserted: totalInserted,
      upserted: totalUpserted,
      skipped: totalSkipped,
      attempts,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, status: 500, message: String(e) }, { status: 500 })
  }
}
