// src/lib/kosis.ts
import { headers } from 'next/headers'

const UA =
  'Mozilla/5.0 (compatible; MISbot/1.0; +https://example.com)';

const KOSIS_API_KEY = process.env.KOSIS_API_KEY ?? '';
if (!KOSIS_API_KEY) {
  throw new Error('Missing KOSIS_API_KEY env');
}

// ✅ 데이터 조회용 베이스 (반드시 /Param 포함)
const BASE_PARAM = 'https://kosis.kr/openapi/Param';
// ✅ 메타(통계표 설명)용 베이스 (여기는 /Param 없음)
const BASE_META = 'https://kosis.kr/openapi';

/** 공통 fetch(텍스트로 받고 필요시 JSON 파싱) */
async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json,text/plain,*/*',
      // 일부 WAF 우회를 위해 리퍼러/오리진 비워둠
    },
    cache: 'no-store',
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

/** KOSIS: 통계자료(Param) 조회 */
export type KosisParamDataParams = {
  orgId: string;
  tblId: string;
  prdSe: 'Y' | 'H' | 'Q' | 'M' | 'D' | 'IR' | 'F' | 'S';
  startPrdDe?: string;
  endPrdDe?: string;
  itmId?: string;   // 기본: 'ALL'
  objL1?: string;   // 기본: 'ALL'
  objL2?: string;   // 기본: 'ALL'
  objL3?: string;   // 필요 시
  format?: 'json';
};

export type KosisDataRow = Record<string, string>;

export async function fetchKosisParamData(p: KosisParamDataParams): Promise<KosisDataRow[]> {
  const url = new URL(`${BASE_PARAM}/statisticsParameterData.do`);
  url.searchParams.set('method', 'getList');
  url.searchParams.set('apiKey', KOSIS_API_KEY);
  url.searchParams.set('format', p.format ?? 'json');
  url.searchParams.set('orgId', p.orgId);
  url.searchParams.set('tblId', p.tblId);
  url.searchParams.set('prdSe', p.prdSe);
  if (p.startPrdDe) url.searchParams.set('startPrdDe', p.startPrdDe);
  if (p.endPrdDe) url.searchParams.set('endPrdDe', p.endPrdDe);
  url.searchParams.set('itmId', p.itmId ?? 'ALL');
  if (p.objL1) url.searchParams.set('objL1', p.objL1);
  if (p.objL2) url.searchParams.set('objL2', p.objL2);
  if (p.objL3) url.searchParams.set('objL3', p.objL3);

  const { ok, status, text } = await fetchText(url.toString());
  if (!ok) throw new Error(`KOSIS data HTTP ${status}`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`KOSIS data Non-JSON: ${text.slice(0, 120)}`);
  }
  if (!Array.isArray(json)) {
    throw new Error(`KOSIS data not array`);
  }
  // KOSIS는 문자열 필드들로 내려옵니다.
  return json as KosisDataRow[];
}

/** ✅ KOSIS: 통계표 설명(메타) — 테이블명, 기관명 등
 * 요청 URL: https://kosis.kr/openapi/statisticsData.do?method=getMeta&type=TBL
 * (주의: 여기엔 /Param 이 없음)
 */
export type KosisTableMeta = {
  TBL_NM?: string;
  TBL_NM_ENG?: string;
  ORG_NM?: string;
  [k: string]: string | undefined;
};

export async function fetchKosisTableMeta(orgId: string, tblId: string): Promise<KosisTableMeta[]> {
  const url = new URL(`${BASE_META}/statisticsData.do`);
  url.searchParams.set('method', 'getMeta');
  url.searchParams.set('type', 'TBL'); // 개발가이드 명시
  url.searchParams.set('apiKey', KOSIS_API_KEY);
  url.searchParams.set('format', 'json');
  url.searchParams.set('orgId', orgId);
  url.searchParams.set('tblId', tblId);

  const { ok, status, text } = await fetchText(url.toString());
  if (!ok) throw new Error(`KOSIS meta HTTP ${status}`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`KOSIS meta Non-JSON: ${text.slice(0, 120)}`);
  }
  if (!Array.isArray(json)) {
    throw new Error(`KOSIS meta not array`);
  }
  return json as KosisTableMeta[];
}
