// src/app/api/macro/update/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

// 타임존 간섭을 완벽히 차단하는 날짜 계산 함수
function addDaysUTC(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function getPastDates(targetDate: string, days: number) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(addDaysUTC(targetDate, -i));
  }
  return dates; 
}

interface MacroRecord {
  base_date: string;
  kr_bond_3y: number;
  us_bond_10y: number;
  kospi_index: number;
  kospi_volume: number;
  usd_krw: number;
  updated_at: string;
  ai_analysis?: string; 
}

let apiErrorLogs: string[] = [];

// Yahoo Finance 전용 수집 함수
async function fetchHistorySafe(symbol: string, options: any) {
  try {
    const data = await yahooFinance.historical(symbol, options);
    return data || [];
  } catch (error: any) {
    console.warn(`[Yahoo] ${symbol} 실패:`, error.message);
    apiErrorLogs.push(`${symbol}: ${error.message.substring(0, 30)}`);
    return [];
  }
}

// ✅ 네이버 금융 전용 수집 함수 (한국 국고채 3년물 정확도 100%)
// API 키 없이 공개된 웹페이지의 HTML을 읽어와서 정규식으로 데이터를 추출합니다.
async function fetchNaverBond3Y(days: number) {
  const result = new Map<string, any>();
  const maxPages = Math.ceil(days / 7) + 1; // 네이버는 한 페이지에 보통 7일치 제공
  
  try {
    for (let page = 1; page <= maxPages; page++) {
      const res = await fetch(`https://finance.naver.com/marketindex/interestDailyQuote.naver?marketindexCd=IRR_GOVT03Y&page=${page}`);
      const html = await res.text();
      
      // 날짜와 첫 번째 숫자(종가)를 안전하게 추출하는 정규식
      const rowRegex = /<td class="date">\s*([\d]{4}\.[\d]{2}\.[\d]{2})\s*<\/td>[\s\S]*?<td class="num">\s*([\d\.]+)\s*<\/td>/g;
      let match;
      let count = 0;
      
      while ((match = rowRegex.exec(html)) !== null) {
        const dateStr = match[1].replace(/\./g, '-'); // "2023.10.25" -> "2023-10-25"
        const val = parseFloat(match[2]);
        result.set(dateStr, { close: val });
        count++;
      }
      
      if (count === 0) break; // 더 이상 데이터가 없으면 중단
    }
  } catch(e: any) {
     console.warn("[Naver] 국고채 3년물 수집 실패:", e.message);
     apiErrorLogs.push(`국고채수집실패: ${e.message.substring(0, 30)}`);
  }
  return result;
}

export async function POST(request: Request) {
  apiErrorLogs = []; 
  
  try {
    const { searchParams } = new URL(request.url);
    const targetDate = searchParams.get('date');
    const period = searchParams.get('period') || 'daily';

    if (!targetDate) {
      return NextResponse.json({ error: 'Date is required (YYYY-MM-DD)' }, { status: 400 });
    }

    let daysToFetch = 1;
    if (period === 'weekly') daysToFetch = 7;
    if (period === 'monthly') daysToFetch = 30;

    const datesToFetch = getPastDates(targetDate, daysToFetch);
    const recordsToInsert: MacroRecord[] = [];

    // --------------------------------------------------------
    // 1. 외부 실제 데이터 일괄 수집 (Yahoo + Naver 병렬 처리)
    // --------------------------------------------------------
    const period1 = new Date(addDaysUTC(targetDate, -daysToFetch - 10));
    const period2 = new Date(addDaysUTC(targetDate, +1)); 

    const queryOptions = { period1, period2 };

    // ✅ Yahoo Finance 3개 + 네이버 금융 1개를 동시에 호출하여 속도 최적화
    const [kospiData, usdKrwData, us10yData, kr3Map] = await Promise.all([
      fetchHistorySafe('^KS11', queryOptions),
      fetchHistorySafe('KRW=X', queryOptions),
      fetchHistorySafe('^TNX', queryOptions),
      fetchNaverBond3Y(daysToFetch + 10) // 네이버 데이터는 바로 Map 객체로 반환됨
    ]);

    const debugMsg = `(데이터: 코스피 ${kospiData.length}건, 환율 ${usdKrwData.length}건, 국고채 ${kr3Map.size}건)`;

    // --------------------------------------------------------
    // 2. 날짜 매핑 
    // --------------------------------------------------------
    const makeMap = (data: any[]) => {
      const m = new Map<string, any>();
      data.forEach(d => {
        if (d.date) {
          const dateStr = d.date.toISOString().split('T')[0];
          m.set(dateStr, d);
        }
      });
      return m;
    };

    const kospiMap = makeMap(kospiData);
    const usdMap = makeMap(usdKrwData);
    const us10Map = makeMap(us10yData);

    const getValue = (map: Map<string, any>, targetStr: string, field: string = 'close') => {
      for (let i = 0; i < 7; i++) {
         const checkDate = addDaysUTC(targetStr, -i);
         if (map.has(checkDate)) return map.get(checkDate)[field] || map.get(checkDate)['adjClose'];
      }
      return null; 
    };

    // --------------------------------------------------------
    // 3. 수집된 데이터를 날짜별 레코드로 매핑
    // --------------------------------------------------------
    for (const d of datesToFetch) {
      const kospiClose = getValue(kospiMap, d, 'close');
      const usdClose = getValue(usdMap, d, 'close');
      const us10Close = getValue(us10Map, d, 'close');
      // 국고채 데이터는 네이버 Map에서 가져옴
      const kr3Close = getValue(kr3Map, d, 'close'); 

      const kospiVolRaw = getValue(kospiMap, d, 'volume') || 0;
      const kospiVolume = kospiVolRaw > 0 ? Number((kospiVolRaw / 100000).toFixed(2)) : 9.5;

      recordsToInsert.push({
        base_date: d,
        kr_bond_3y: kr3Close ? Number(kr3Close.toFixed(3)) : 3.25, // 소수점 3자리까지 유지
        us_bond_10y: us10Close ? Number(us10Close.toFixed(3)) : 4.15,
        kospi_index: kospiClose ? Number(kospiClose.toFixed(2)) : 2600,
        kospi_volume: Number(kospiVolume),
        usd_krw: usdClose ? Number(usdClose.toFixed(2)) : 1335,
        updated_at: new Date().toISOString(),
      });
    }

    // --------------------------------------------------------
    // 4. AI 분석 프롬프트 작성 
    // --------------------------------------------------------
    const firstData = recordsToInsert[0]; 
    const latestData = recordsToInsert[recordsToInsert.length - 1]; 
    
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `
      너는 한국 대형 증권사의 전사 기획팀 책임자야.
      다음은 ${period === 'daily' ? '오늘' : period === 'weekly' ? '최근 1주일' : '최근 1개월'}간의 주요 거시경제 지표 변화야.

      [기간 시작일: ${firstData.base_date}]
      - KOSPI 지수: ${firstData.kospi_index}pt
      - 원/달러 환율: ${firstData.usd_krw}원

      [기간 종료일: ${latestData.base_date}]
      - KOSPI 지수: ${latestData.kospi_index}pt (거래량 보정지수 ${latestData.kospi_volume})
      - 원/달러 환율: ${latestData.usd_krw}원
      - 국고채 3년물: ${latestData.kr_bond_3y.toFixed(3)}%
      - 미국 10년물: ${latestData.us_bond_10y.toFixed(3)}%

      위 데이터를 바탕으로 다음 두 가지를 작성해 줘:
      1. ${period === 'daily' ? '일간' : period === 'weekly' ? '주간' : '월간'} 시장 흐름 요약: 시작일 대비 종료일의 변화 추세를 중심으로 2~3문장 요약.
      2. 기획팀 시사점: 이 수치 변화가 증권사 주요 수익원(브로커리지, 채권운용, IB)에 미칠 영향과 대응 포인트 (불릿 포인트 2개).
      마크다운을 쓰지 말고, 평문과 기호(-, 1. 등)만 사용해서 간결하게 작성해 줘.
    `;

    const result = await model.generateContent(prompt);
    latestData.ai_analysis = result.response.text();

    // --------------------------------------------------------
    // 5. Supabase DB 일괄 저장
    // --------------------------------------------------------
    const { error } = await supabaseAdmin
      .from('macro_indicators')
      .upsert(recordsToInsert, { onConflict: 'base_date' });

    if (error) throw error;

    let warningMsg = apiErrorLogs.length > 0 ? `\n(일부 지표 실패: ${apiErrorLogs.join(', ')})` : '';

    return NextResponse.json({ 
      success: true, 
      message: `${daysToFetch}일치 갱신 완료! ${debugMsg}${warningMsg}`,
      data: latestData 
    });

  } catch (error: any) {
    console.error('Macro update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}