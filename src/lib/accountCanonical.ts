// src/lib/accountCanonical.ts
// 표준 계정 키 > 계정과목이 비슷하거나 유사한 친구들을 묶어주는 역할!
export type CanonKey =
  | 'BS_TOTAL_ASSETS' | 'BS_TOTAL_LIABILITIES' | 'BS_TOTAL_EQUITY'
  | 'CIS_REVENUE' | 'CIS_OPERATING_REVENUE' | 'CIS_OPERATING_EXPENSES'
  | 'CIS_SG&A' | 'CIS_OPERATING_PROFIT' | 'CIS_NON_OPERATING_EXPENSES'
  | 'CIS_PROFIT_BEFORE_TAX' | 'CIS_NET_INCOME'

type CanonDef = {
  key: CanonKey
  sj: 'BS' | 'CIS'
  label: string            // 한글 표기
  ids: string[]            // IFRS/DART id 후보 (소문자 비교)
  names: string[]          // 한글 표기 후보 (정규화 비교)
}

const N = (s?: string) =>
  (s ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')          // 공백 제거
    .replace(/[·∙\.\-_/(),\[\]{}]/g, '') // 특수문자 제거
    .replace(/및/g, '와')         // 및 → 와
    .replace(/판매와관리비|판매비와일반관리비|판관비/g, '판매비와관리비')

export const CANONS: CanonDef[] = [
  // ── BS
  { key: 'BS_TOTAL_ASSETS', sj: 'BS', label: '자산총계',
    ids: ['ifrs-full_assets','ifrs_assets'],
    names: ['자산총계','총자산','자산 총계','자 산 총 계'].map(N)
  },
  { key: 'BS_TOTAL_LIABILITIES', sj: 'BS', label: '부채총계',
    ids: ['ifrs-full_liabilities','ifrs_liabilities'],
    names: ['부채총계','총부채','부채 총계'].map(N)
  },
  { key: 'BS_TOTAL_EQUITY', sj: 'BS', label: '자본총계',
    ids: ['ifrs-full_equity','ifrs_equity'],
    names: ['자본총계','총자본','자본 총계'].map(N)
  },

  // ── CIS
  { key: 'CIS_REVENUE', sj: 'CIS', label: '매출액',
    ids: ['ifrs-full_revenue','ifrs_revenue','revenuefromcontractswithcustomers'],
    names: ['매출액','매 출 액'].map(N)
  },
  { key: 'CIS_OPERATING_REVENUE', sj: 'CIS', label: '영업수익',
    ids: ['dart_operatingrevenue','operatingrevenue'],
    names: ['영업수익','영업 수익'].map(N)
  },
  { key: 'CIS_OPERATING_EXPENSES', sj: 'CIS', label: '영업비용',
    ids: ['operatingexpenses','ifrs-full_operatingexpenses'],
    names: ['영업비용'].map(N)
  },
  { key: 'CIS_SG&A', sj: 'CIS', label: '판매비와관리비',
    ids: ['sellinggeneraladministrativeexpenses','sg&a','sellingandadministrativeexpense'],
    names: ['판매비와관리비','판매와일반관리비','판매와관리비','판관비'].map(N)
  },
  { key: 'CIS_OPERATING_PROFIT', sj: 'CIS', label: '영업이익',
    ids: ['ifrs_operatingprofitloss','profitlossfromoperatingactivities','dart_operatingincomeloss'],
    names: ['영업이익','영업이익손실'].map(N)
  },
  { key: 'CIS_NON_OPERATING_EXPENSES', sj: 'CIS', label: '영업외비용',
    ids: ['nonoperatingexpenses','financecosts'],
    names: ['영업외비용','영업 외 비용','금융비용'].map(N)
  },
  { key: 'CIS_PROFIT_BEFORE_TAX', sj: 'CIS', label: '법인세차감전이익',
    ids: ['profitlossbeforetax'],
    names: ['법인세차감전이익','법인세 비용차감전이익'].map(N)
  },
  { key: 'CIS_NET_INCOME', sj: 'CIS', label: '당기순이익',
    ids: ['ifrs-full_profitloss','ifrs_profitloss','profitloss','netincome'],
    names: ['당기순이익','당기순이익손실','분기순이익'].map(N)
  },
]

// 분류기: (sj, id, name) → 가장 유력한 CanonKey와 confidence(0~100)
export function classifyToCanon(sj: 'BS'|'CIS', account_id?: string|null, account_nm?: string|null) {
  const id = (account_id ?? '').toLowerCase()
  const nmN = N(account_nm)
  let best: { key: CanonKey, score: number } | null = null

  for (const c of CANONS) {
    if (c.sj !== sj) continue
    let score = 0

    // 1) ID 정확/부분 일치
    if (id) {
      if (c.ids.includes(id)) score = Math.max(score, 100)
      else if (c.ids.some(x => id.includes(x))) score = Math.max(score, 80)
    }

    // 2) 이름 정확/부분 일치
    if (nmN) {
      if (c.names.includes(nmN)) score = Math.max(score, 70)
      else if (c.names.some(x => nmN.includes(x))) score = Math.max(score, 50)
    }

    if (score > 0 && (!best || score > best.score)) best = { key: c.key, score }
  }

  return best // null이면 불일치
}

export const CANON_OPTIONS = {
  BS: CANONS.filter(c => c.sj === 'BS').map(c => ({ key: c.key, label: c.label })),
  CIS: CANONS.filter(c => c.sj === 'CIS').map(c => ({ key: c.key, label: c.label })),
}
