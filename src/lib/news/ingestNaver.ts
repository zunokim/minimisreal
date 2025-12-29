import * as cheerio from 'cheerio';
import { fetchHtml } from '@/lib/fetchHtml';

export interface NewsArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  fullContent?: string;
}

// 메인 함수 (새 이름)
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
        const link = item.link;
        let fullContent = '';

        if (link) {
            // 인코딩 문제가 해결된 fetchHtml 함수 사용
            const html = await fetchHtml(link); 
            
            if (html) {
                const $ = cheerio.load(html);
                
                // 불필요한 요소 제거
                $('script').remove();
                $('style').remove();
                $('nav').remove();
                $('header').remove();
                $('footer').remove();
                
                // 1차 시도: 네이버 뉴스 표준 본문 ID
                let text = $('#dic_area').text();

                // 2차 시도: 일반 언론사 사이트 (p 태그 수집)
                if (!text || text.trim().length < 50) {
                    text = '';
                    $('p').each((_, el) => {
                        const pText = $(el).text().trim();
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
          // 본문 스크래핑 실패 시 요약문(description)을 대신 사용
          fullContent: fullContent || item.description.replace(/<[^>]*>?/gm, '') 
        };
      })
    );

    return detailedArticles;

  } catch (e) {
    console.error('Naver News API Error:', e);
    return [];
  }
}

// 👇 [핵심] 기존 코드와의 호환성을 위해 옛날 이름으로도 함수를 내보냄
// 이 줄이 있어야 빌드 에러가 해결됩니다.
export const ingestNaverNews = fetchNaverNews;