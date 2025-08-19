// src/lib/dart.ts

type FnlttRow = {
  rcept_no: string
  reprt_code: string
  bsns_year: string
  corp_code: string
  sj_div: 'BS' | 'CIS' | string
  sj_nm?: string
  account_id?: string
  account_nm: string
  thstrm_amount?: string
  thstrm_add_amount?: string
  frmtrm_amount?: string
  frmtrm_q_amount?: string
  frmtrm_add_amount?: string
  bfefrmtrm_amount?: string
  ord?: string
  currency?: string
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

const toNumeric = (v?: string | null) => {
  if (v == null) return null
  const s = String(v).replace(/[, ]/g, '').trim()
  if (s === '' || s === '-' || s.toLowerCase() === 'nan') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** 단일회사(OFS) 기준으로 재무제표 전체(계정 전부) 조회 */
export async function fetchFnlttAll(params: {
  corp_code: string
  bsns_year: number
  reprt_code: '11013'|'11012'|'11014'|'11011'
  fs_div?: 'CFS'|'OFS'   // 기본 OFS(단일회사)
}) {
  const { corp_code, bsns_year, reprt_code, fs_div='OFS' } = params
  const url = new URL('https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json')
  url.searchParams.set('crtfc_key', process.env.DART_API_KEY!)
  url.searchParams.set('corp_code', corp_code)
  url.searchParams.set('bsns_year', String(bsns_year))
  url.searchParams.set('reprt_code', reprt_code)
  url.searchParams.set('fs_div', fs_div) // ✅ OFS(단일회사)

  const res = await fetch(url.toString(), { next: { revalidate: 0 } })
  const data = await res.json() as {
    status: string, message: string, list?: FnlttRow[]
  }

  if (data.status !== '000') {
    throw new Error(`DART ${data.status}: ${data.message}`)
  }

  const list = (data.list ?? []).filter(r => r.sj_div === 'BS' || r.sj_div === 'CIS')
  return list.map(r => ({
    ...r,
    thstrm_amount: toNumeric(r.thstrm_amount),
    thstrm_add_amount: toNumeric(r.thstrm_add_amount),
    frmtrm_amount: toNumeric(r.frmtrm_amount),
    frmtrm_q_amount: toNumeric(r.frmtrm_q_amount),
    frmtrm_add_amount: toNumeric(r.frmtrm_add_amount),
    bfefrmtrm_amount: toNumeric(r.bfefrmtrm_amount),
    ord: r.ord ? Number(r.ord) : null
  }))
}

// 간단 백오프 래퍼
export async function fetchWithBackoff<T>(fn: () => Promise<T>, tries=4) {
  let delay = 500
  for (let i=0;i<tries;i++) {
    try { return await fn() } catch (e:any) {
      if (i === tries-1) throw e
      await sleep(delay); delay *= 2
    }
  }
  throw new Error('unreachable')
}
