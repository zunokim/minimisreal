// src/lib/kotc/parser.ts
// 설명: K-OTC "기간별 시장지표" 엑셀 파서 유틸 (엑셀 -> 정규화 레코드)
// ESLint 통과 & 보안: 외부 입력 sanitize, 예외 처리, 타입 안전 유지
import * as XLSX from 'xlsx'

export type KotcRow = {
  prd_de: string // YYYY-MM-DD
  section: string // 전체/등록기업부/지정기업부 등
  avg_price: number | null
  volume: number | null
  amount_krw: number | null
  market_cap_krw: number | null
  raw: Record<string, unknown>
}

function toNumber(v: unknown): number | null {
  if (v == null) return null
  const s = String(v).replace(/[,\s]/g, '')
  if (s === '' || s === '-' || s.toLowerCase() === 'null') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function fromExcelSerial(n: number): string {
  const date = XLSX.SSF.parse_date_code(n)
  if (!date) throw new Error(`Invalid Excel serial: ${n}`)
  const y = String(date.y).padStart(4, '0')
  const m = String(date.m).padStart(2, '0')
  const d = String(date.d).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normDate(v: unknown): string {
  if (typeof v === 'number') return fromExcelSerial(v)
  const s = String(v ?? '').trim().replace(/[./]/g, '-')
  const m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/)
  if (!m) return s
  const y = m[1]
  const mm = String(Number(m[2])).padStart(2, '0')
  const dd = String(m[3] ? Number(m[3]) : 1).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

export function parseKotcTermMarketExcel(
  fileBuffer: ArrayBuffer,
  options: { section: string }
): KotcRow[] {
  const wb = XLSX.read(fileBuffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('엑셀 시트를 찾을 수 없습니다.')

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })

  const headerMap = {
    date: [/^일자?$/],
    avg: [/가중주가평균/],
    vol: [/^거래량/],
    amt: [/^거래대금/],
    cap: [/시가총액/],
  }

  const findKey = (obj: Record<string, unknown>, regs: RegExp[]): string | null => {
    for (const k of Object.keys(obj)) {
      const norm = k.replace(/\s|\(.*?\)|\[.*?]/g, '')
      if (regs.some((r) => r.test(norm))) return k
    }
    return null
  }

  const section = options.section || '전체'
  const out: KotcRow[] = []

  for (const r of rows) {
    const kDate = findKey(r, headerMap.date)
    if (!kDate) continue

    const prd_de = normDate(r[kDate])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prd_de)) continue

    const avg_price = toNumber(r[findKey(r, headerMap.avg) ?? ''])
    const volume = toNumber(r[findKey(r, headerMap.vol) ?? ''])
    const amount_krw = toNumber(r[findKey(r, headerMap.amt) ?? ''])
    const market_cap_krw = toNumber(r[findKey(r, headerMap.cap) ?? ''])

    out.push({ prd_de, section, avg_price, volume, amount_krw, market_cap_krw, raw: r })
  }
  return out
}
