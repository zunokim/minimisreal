// src/lib/fetchHtml.ts
import axios from 'axios';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';

export async function fetchHtml(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000, // 타임아웃 10초로 연장
      headers: {
        // 실제 크롬 브라우저처럼 보이게 헤더 설정
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      maxRedirects: 5
    });

    const buffer = Buffer.from(response.data);

    // 1. [우선순위 1] HTML 헤더(Meta Tag)에서 charset 확인
    // 버퍼 앞부분만 살짝 읽어서 <meta charset="euc-kr"> 같은게 있는지 찾음
    const headPart = buffer.slice(0, 1000).toString('ascii').toLowerCase();
    let detectedEncoding = '';

    if (headPart.includes('charset=euc-kr') || headPart.includes('charset="euc-kr"')) {
        detectedEncoding = 'euc-kr';
    } else if (headPart.includes('charset=ks_c_5601-1987')) {
        detectedEncoding = 'euc-kr';
    } else if (headPart.includes('charset=utf-8') || headPart.includes('charset="utf-8"')) {
        detectedEncoding = 'utf-8';
    }

    // 2. [우선순위 2] 메타 태그가 없으면 jschardet으로 추측
    if (!detectedEncoding) {
        const det = jschardet.detect(buffer);
        detectedEncoding = det.encoding ? det.encoding.toLowerCase() : 'utf-8';
    }

    // 3. 한국 사이트 예외 처리 (오감지 보정)
    if (
        detectedEncoding.includes('windows-125') || 
        detectedEncoding.includes('iso-8859') || 
        detectedEncoding === 'ascii'
    ) {
        // 한국 뉴스 사이트가 유럽 인코딩일 리 없음 -> UTF-8 아니면 EUC-KR임
        // 보통 jschardet이 EUC-KR을 Windows-1252로 오인하는 경우가 많음 -> 일단 EUC-KR 시도해보고 이상하면 UTF-8
        // 하지만 안전하게 UTF-8로 fallback하거나, 사이트 특성을 탐
        // 여기선 UTF-8로 강제 (요즘 추세) 하되, 뉴스웨이는 EUC-KR일 수 있음.
        // 메타태그 감지가 실패했을 때 여기로 오는데, 뉴스웨이는 메타태그가 확실히 있으므로 1번에서 걸러질 것임.
        detectedEncoding = 'utf-8';
    }

    // 4. 최종 디코딩
    const decodedContent = iconv.decode(buffer, detectedEncoding);

    return decodedContent;
  } catch (error) {
    console.error(`[Fetch Error] ${url}:`, error);
    return '';
  }
}