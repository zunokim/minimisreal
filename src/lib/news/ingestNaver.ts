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

// [변경] start 파라미터 추가 (기본값 1)
export async function fetchNaverNews(keyword: string, display: number = 10, start: number = 1): Promise<NewsArticle[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Naver API Key is missing');
    return [];
  }

  // [변경] start 파라미터 적용
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

    // 본문 스크래핑 (병렬 처리)
    const detailedArticles = await Promise.all(
      items.map(async (item: any) => {
        const link = item.link;
        let fullContent = '';

        if (link) {
            const html = await fetchHtml(link); 
            
            if (html) {
                const $ = cheerio.load(html);
                $('script').remove();
                $('style').remove();
                $('nav').remove();
                $('header').remove();
                $('footer').remove();
                
                let text = $('#dic_area').text();
                if (!text || text.trim().length < 50) {
                    text = '';
                    $('p').each((_, el) => {
                        const pText = $(el).text().trim();
                        if (pText.length > 20) text += pText + ' ';
                    });
                }
                fullContent = text.trim();
            }
        }

        return {
          title: item.title.replace(/<[^>]*>?/gm, ''),
          link: item.link,
          description: item.description.replace(/<[^>]*>?/gm, ''),
          pubDate: item.pubDate,
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

export const ingestNaverNews = fetchNaverNews;