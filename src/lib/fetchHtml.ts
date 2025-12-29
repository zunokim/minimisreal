// src/lib/fetchHtml.ts
import axios from 'axios';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';

export async function fetchHtml(url: string): Promise<string> {
  try {
    // 1. axios로 요청하되, 데이터를 'arraybuffer'(바이너리)로 받습니다.
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 5000, // 5초 넘으면 포기
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      }
    });

    const buffer = Buffer.from(response.data);

    // 2. 인코딩 감지 (EUC-KR인지 UTF-8인지 탐정처럼 알아냄)
    const detected = jschardet.detect(buffer);
    
    // 감지 실패 시 기본값은 UTF-8, 한국 사이트는 주로 EUC-KR이나 Windows-1252로 잡힘
    const encoding = detected.encoding || 'utf-8';
    
    // 3. 감지된 인코딩으로 디코딩 (깨진 문자 복구)
    const decodedContent = iconv.decode(buffer, encoding);

    return decodedContent;
  } catch (error) {
    console.error(`[Fetch Error] ${url}:`, error);
    return '';
  }
}