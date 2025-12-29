// src/lib/news/ingestNaver.ts
import * as cheerio from 'cheerio';
import { fetchHtml } from '@/lib/fetchHtml'; // 위에서 만든 함수 import

// 뉴스 데이터 타입 정의
export interface NewsArticle {
  title: string;
  link: string;
  description: string; // 요약문 (API 제공)
  pubDate: string;
  fullContent?: string; // 우리가 긁어올 본문
}

export async function fetchNaverNews(keyword: string): Promise<NewsArticle[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Naver API Key is missing');
    return [];
  }

  // 1. 네이버 검색 API 호출 (최신순 10개)
  const apiUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=10&sort=date`;
  
  try {
    const res = await fetch(apiUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    const data = await res.json();
    const items = data.items || [];

    // 2. 각 뉴스 링크에 들어가서 본문 스크래핑 (병렬 처리)
    const detailedArticles = await Promise.all(
      items.map(async (item: any) => {
        const link = item.link; // 기사 원문 링크
        let fullContent = '';

        // API가 주는 description은 너무 짧으므로, 링크에 직접 접속해서 본문을 가져옴
        if (link) {
            const html = await fetchHtml(link); // [핵심] 인코딩 처리된 HTML 가져오기
            
            if (html) {
                const $ = cheerio.load(html);
                
                // [본문 추출 로직]
                // 사이트마다 구조가 달라서 완벽하진 않지만, 일반적으로 본문은 p 태그에 많음
                // 불필요한 스크립트, 스타일 제거
                $('script').remove();
                $('style').remove();
                $('nav').remove();
                $('header').remove();
                $('footer').remove();
                
                // 1차 시도: 네이버 뉴스라면 #dic_area (본문 ID)
                let text = $('#dic_area').text();

                // 2차 시도: 없다면 일반적인 <p> 태그 긁어오기
                if (!text || text.trim().length < 50) {
                    text = '';
                    $('p').each((_, el) => {
                        const pText = $(el).text().trim();
                        // 너무 짧은 문장(메뉴명 등)은 제외
                        if (pText.length > 20) {
                            text += pText + ' ';
                        }
                    });
                }
                
                fullContent = text.trim();
            }
        }

        return {
          title: item.title.replace(/<[^>]*>?/gm, ''), // 태그 제거
          link: item.link,
          description: item.description.replace(/<[^>]*>?/gm, ''),
          pubDate: item.pubDate,
          fullContent: fullContent || item.description.replace(/<[^>]*>?/gm, '') // 본문 실패하면 요약문이라도 저장
        };
      })
    );

    return detailedArticles;

  } catch (e) {
    console.error('Naver News API Error:', e);
    return [];
  }
}