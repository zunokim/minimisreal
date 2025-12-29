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

// 💡 [업데이트] 본문 선택자 대폭 추가 (뉴스웨이, 더벨, 등등 대응)
const CONTENT_SELECTORS = [
    '#dic_area',                 // 네이버 뉴스
    '#article-view-content-div', // 연합인포맥스
    '#articleText',              // [NEW] 뉴스웨이, 일부 경제지
    '#news_body_id',             // 
    '.article_body',             // 공통
    '.article-body',             // 공통
    '#articleBody',              // 공통
    '.view_txt',                 // 공통
    '.view_con',                 // [NEW] 일반적인 CMS
    '.news_view',                // 
    '#txt_area',                 // 한국경제 등
    '.cnt_view',                 // 
    '#textBody',                 // [NEW] 일부 언론사
    '.news_content',             // [NEW]
    '.article_view',             // [NEW]
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
                
                // 광고, 스크립트, 관련기사 등 불필요 요소 제거 강화
                $('script, style, nav, header, footer, .ad, .advertisement, iframe, .related_news, .img_desc').remove();
                
                // 1. 등록된 선택자들로 본문 찾기
                for (const selector of CONTENT_SELECTORS) {
                    const text = $(selector).text().trim();
                    if (text.length > 50) {
                        fullContent = text;
                        break; 
                    }
                }

                // 2. 못 찾았으면 <p> 태그 수집 (최후의 수단)
                if (!fullContent) {
                    let pText = '';
                    $('p').each((_, el) => {
                        const t = $(el).text().trim();
                        // 본문일 가능성이 높은 긴 문장만 수집
                        if (t.length > 20) {
                            pText += t + ' ';
                        }
                    });
                    if (pText.length > 50) fullContent = pText.trim();
                }
            }
        }

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

export const ingestNaverNews = fetchNaverNews;