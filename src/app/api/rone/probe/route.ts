// src/app/api/rone/probe/route.ts
import { NextRequest, NextResponse } from 'next/server'

/**
 * R-ONE Probe (진단용)
 * GET /api/rone/probe?statblId=...&dtacycle=QY&pIndex=1&pSize=100000&expose=0
 *
 * - statblId: 필수 (예: TT244963134453269)
 * - dtacycle: 기본 QY
 * - pIndex: 기본 1
 * - pSize: 기본 200 (원하면 크게)
 * - expose: 개발모드에서 1로 주면 full URL(키 포함)도 반환 (절대 운영에서 켜지 마세요)
 *
 * 반환: 마스킹된 URL, status, content-type, 응답 미리보기, JSON 파싱결과(행 개수, 기간/지역 샘플), 에러 메시지 등
 */

function getRoneKey() {
  return (
    process.env.RONE_API_KEY ||
    process.env.NEXT_PUBLIC_RONE_API_KEY ||
    process.env.RONE_KEY ||
    process.env.NEXT_PUBLIC_RONE_KEY ||
    ''
  )
}

function buildUrl(params: {
  statblId: string
  dtacycle?: string
  pIndex?: number
  pSize?: number
}) {
  const KEY = getRoneKey()
  if (!KEY) throw new Error('R-ONE API KEY가 환경변수에 없습니다. (RONE_API_KEY 등)')
  const url = new URL('https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do')
  url.searchParams.set('KEY', KEY)
  url.searchParams.set('Type', 'json')
  url.searchParams.set('STATBL_ID', params.statblId)
  url.searchParams.set('DTACYCLE_CD', params.dtacycle || 'QY')
  url.searchParams.set('pIndex', String(params.pIndex ?? 1))
  url.searchParams.set('pSize', String(params.pSize ?? 200))
  return url.toString()
}

function maskKeyInUrl(u: string) {
  // KEY=xxxxx 를 KEY=**** 로 마스킹
  return u.replace(/([?&]KEY)=([^&]+)/i, (_m, g1) => `${g1}=****`)
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const statblId = sp.get('statblId') || ''
    const dtacycle = sp.get('dtacycle') || 'QY'
    const pIndex = Number(sp.get('pIndex') || '1')
    const pSize = Number(sp.get('pSize') || '200')
    const expose = sp.get('expose') === '1'

    if (!statblId) {
      return NextResponse.json(
        { error: 'statblId 쿼리 파라미터가 필요합니다.' },
        { status: 400 },
      )
    }

    const fullUrl = buildUrl({ statblId, dtacycle, pIndex, pSize })
    const maskedUrl = maskKeyInUrl(fullUrl)

    // 개발 콘솔에는 전체 URL 로그 (운영에선 최소화)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[R-ONE PROBE] URL:', fullUrl)
    } else {
      console.log('[R-ONE PROBE] URL(masked):', maskedUrl)
    }

    const res = await fetch(fullUrl, { cache: 'no-store' })
    const status = res.status
    const contentType = res.headers.get('content-type') || ''
    const text = await res.text()
    const textHead = text.slice(0, 600)

    let parsed: any = null
    let rowCount = 0
    let periods: Array<{ id: string; desc: string }> = []
    let regions: Array<string> = []
    let firstRow: any = null
    let hasJson = false
    let parseError: string | null = null

    try {
      parsed = JSON.parse(text)
      hasJson = true
      const box = parsed?.SttsApiTblData?.find((b: any) => Array.isArray(b?.row))
      const rows: any[] = box?.row ?? []
      rowCount = Array.isArray(rows) ? rows.length : 0
      if (rowCount > 0) {
        firstRow = rows[0]
        // 기간/지역 샘플 (앞쪽 일부만)
        const periodSet = new Map<string, string>()
        const regionSet = new Set<string>()
        for (const r of rows.slice(0, 200)) {
          const id = r?.WRTTIME_IDTFR_ID
          const desc = r?.WRTTIME_DESC
          if (id && !periodSet.has(id)) periodSet.set(id, desc || '')
          const cls = r?.CLS_FULLNM || r?.CLS_NM
          if (cls) regionSet.add(String(cls))
          if (periodSet.size >= 8 && regionSet.size >= 8) break
        }
        periods = Array.from(periodSet.entries()).map(([id, desc]) => ({ id, desc }))
        regions = Array.from(regionSet)
      }
    } catch (e: any) {
      parseError = String(e?.message || e)
    }

    const body: any = {
      ok: res.ok,
      status,
      contentType,
      fetch_url_masked: maskedUrl,
      hasJson,
      rowCount,
      sample: {
        periods,
        regions,
        firstRow,
      },
      textHead,
      parseError,
      note: '운영 배포에서는 expose=1 사용 금지. 개발모드에서만 사용하세요.',
    }

    // 개발모드 + 요청시 노출 허용 → full url도 반환 (키 포함)
    if (expose && process.env.NODE_ENV !== 'production') {
      body.fetch_url_full = fullUrl
    }

    return NextResponse.json(body)
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    )
  }
}
