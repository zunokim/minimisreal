// src/lib/news/ingestNaver.ts
import * as cheerio from 'cheerio';
import { fetchHtml } from '@/lib/fetchHtml';

export interface NewsArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  fullContent?: string;
}

// 💡 주요 언론사별 본문이 들어있는 ID/Class 목록
const CONTENT_SELECTORS = [
    '#dic_area',                // 네이버 뉴스
    '#article-view-content-div', // 연합인포맥스, 일부 지방지
    '.article_body',            // 일반적인 언론사 공통
    '#news_body_id',            // 일부 경제지
    '.news_view',               // 
    '#txt_area',                // 한국경제 등
    '.view_txt',                // 
    '.cnt_view',                // 
    '#articleBody',             // 
    '.article-body',            // 
];

export async function fetchNaverNews(keyword: string, display: number = 10, start: number = 1): Promise<NewsArticle[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Naver API Key is missing');
    return [];
  }

  const apiUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=${display}&start=${start}&sort=date`;
  
  try {
    const res = await fetch(apiUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    const data = await res.json();
    const items = data.items || [];

    const detailedArticles = await Promise.all(
      items.map(async (item: any) => {
        const link = item.link;
        let fullContent = '';

        if (link) {
            const html = await fetchHtml(link); 
            
            if (html) {
                const $ = cheerio.load(html);
                
                // 불필요한 요소 제거 (광고, 스크립트 등)
                $('script, style, nav, header, footer, .ad, .advertisement, iframe').remove();
                
                // [핵심 변경] 1. 유명한 본문 ID들을 순서대로 찔러봄
                for (const selector of CONTENT_SELECTORS) {
                    const text = $(selector).text().trim();
                    // 텍스트가 50자 이상이면 본문으로 인정하고 루프 종료
                    if (text.length > 50) {
                        fullContent = text;
                        break; 
                    }
                }

                // [핵심 변경] 2. 그래도 못 찾았으면 최후의 수단으로 <p> 태그 수집
                if (!fullContent) {
                    let pText = '';
                    $('p').each((_, el) => {
                        const t = $(el).text().trim();
                        // 너무 짧은 건 메뉴/링크일 확률 높음 -> 제외
                        if (t.length > 20) {
                            pText += t + ' ';
                        }
                    });
                    if (pText.length > 50) fullContent = pText.trim();
                }
            }
        }

        // 본문을 못 구했으면 요약문(description)이라도 씀
        const finalContent = fullContent || item.description.replace(/<[^>]*>?/gm, '');

        return {
          title: item.title.replace(/<[^>]*>?/gm, ''),
          link: item.link,
          description: item.description.replace(/<[^>]*>?/gm, ''),
          pubDate: item.pubDate,
          fullContent: finalContent
        };
      })
    );

    return detailedArticles;

  } catch (e) {
    console.error('Naver News API Error:', e);
    return [];
  }
}

// 호환성 유지
export const ingestNaverNews = fetchNaverNews;