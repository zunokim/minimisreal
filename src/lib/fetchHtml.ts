// src/lib/fetchHtml.ts
import axios from 'axios';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';

export async function fetchHtml(url: string): Promise<string> {
  try {
    // 1. 바이너리 데이터로 가져옴
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      }
    });

    const buffer = Buffer.from(response.data);

    // 2. 인코딩 감지
    const detected = jschardet.detect(buffer);
    let encoding = detected.encoding ? detected.encoding.toLowerCase() : 'utf-8';
    
    // [핵심 수정] 한국 사이트 크롤링 보정 로직
    // 감지기가 'windows-125x'나 'iso-8859' 등 서구권 인코딩으로 착각하면 -> 무조건 UTF-8로 강제함
    if (
        encoding.includes('windows-125') || 
        encoding.includes('iso-8859') || 
        encoding === 'ascii'
    ) {
        encoding = 'utf-8';
    }

    // EUC-KR 계열 보정
    if (encoding === 'ks_c_5601-1987') {
        encoding = 'euc-kr';
    }

    // 3. 디코딩
    const decodedContent = iconv.decode(buffer, encoding);

    return decodedContent;
  } catch (error) {
    console.error(`[Fetch Error] ${url}:`, error);
    return '';
  }
}