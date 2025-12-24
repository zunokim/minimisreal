// src/lib/kotc/collector.ts
// 설명: Headless Chrome으로 K-OTC "기간별 시장지표" 페이지 자동 조작 → 엑셀 응답 버퍼 획득
// - Vercel/Lambda: @sparticuz/chromium + puppeteer-core 조합 사용
// - 로컬: CHROME_EXECUTABLE_PATH 환경변수로 크롬 실행 경로 지정

import chromium from '@sparticuz/chromium'
import puppeteer, { Browser } from 'puppeteer-core'

export type CollectParams = {
  from: string // YYYY-MM-DD
  to: string // YYYY-MM-DD
  section: string // '전체' | '등록기업부' | '지정기업부' 등 UI 표시명
}

export async function getBrowser(): Promise<Browser> {
  const isLambda = !!process.env.AWS_REGION || !!process.env.VERCEL

  // ─────────────────────────────
  // 1) Vercel/Lambda 환경: @sparticuz/chromium 사용
  // ─────────────────────────────
  if (isLambda) {
    const executablePath = await chromium.executablePath()
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    })
  }

  // ─────────────────────────────
  // 2) 로컬 개발 환경: CHROME_EXECUTABLE_PATH 필수
  // ─────────────────────────────
  const executablePath = process.env.CHROME_EXECUTABLE_PATH

  if (!executablePath) {
    throw new Error(
      '로컬 환경에서 사용할 Chrome 실행 파일 경로를 찾을 수 없습니다. ' +
        '다음과 같이 .env.local 에 CHROME_EXECUTABLE_PATH 를 설정해 주세요.\n' +
        '예) Windows: CHROME_EXECUTABLE_PATH="C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe"\n' +
        '예) macOS:  CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"'
    )
  }

  return puppeteer.launch({
    headless: 'new',
    executablePath,
  })
}

/**
 * 페이지에서 날짜와 소속부를 설정하고 "엑셀 다운로드" 클릭 → 파일 응답 버퍼 획득
 * 주의: 사이트 변경에 따라 셀렉터가 바뀔 수 있으므로 예외 처리 강화
 */
export async function fetchKotcExcel(params: CollectParams): Promise<Uint8Array> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    // 1) 진입
    await page.goto('https://www.k-otc.or.kr/public/stat/termMarketList', {
      waitUntil: 'networkidle2',
      timeout: 60_000,
    })

    // 2) 날짜 입력 (XPath 대신 DOM 탐색으로 구현)
    const setDate = async (labelText: string, value: string) => {
      await page.evaluate(
        (label, v) => {
          // label 유사 텍스트 근처에서 input 찾기
          const textContainers = Array.from(
            document.querySelectorAll<HTMLElement>('label, span, dt, th, div')
          )

          let targetInput: HTMLInputElement | null = null

          for (const el of textContainers) {
            const text = (el.textContent ?? '').trim()
            if (!text) continue
            if (!text.includes(label)) continue

            // 같은 부모 안에서 date/text input 검색
            const root =
              el.parentElement ??
              el.closest<HTMLElement>('li, tr, td, th, .form, .search, .tbl') ??
              undefined

            const scope = root ?? document

            const candidate =
              scope.querySelector<HTMLInputElement>('input[type="date"]') ??
              scope.querySelector<HTMLInputElement>('input[type="text"]') ??
              scope.querySelector<HTMLInputElement>('input')

            if (candidate) {
              targetInput = candidate
              break
            }
          }

          // fallback: 첫 번째 date input → 없으면 첫 번째 input
          if (!targetInput) {
            targetInput =
              document.querySelector<HTMLInputElement>('input[type="date"]') ??
              document.querySelector<HTMLInputElement>('input')
          }

          if (targetInput) {
            targetInput.value = v
            targetInput.dispatchEvent(new Event('input', { bubbles: true }))
            targetInput.dispatchEvent(new Event('change', { bubbles: true }))
          }
        },
        labelText,
        value
      )
    }

    await setDate('시작일', params.from)
    await setDate('종료일', params.to)

    // 3) 소속부 선택 (select + option 텍스트로 검색)
    await page.evaluate((sectionText) => {
      const selects = Array.from(document.querySelectorAll<HTMLSelectElement>('select'))
      for (const sel of selects) {
        const options = Array.from(sel.querySelectorAll<HTMLOptionElement>('option'))
        const match = options.find((opt) =>
          (opt.textContent ?? '').trim().includes(sectionText)
        )
        if (match) {
          sel.value = match.value
          sel.dispatchEvent(new Event('change', { bubbles: true }))
          break
        }
      }
    }, params.section)

    // 4) 엑셀 다운로드 버튼 클릭 ↔ 파일 응답 대기
    const respPromise = page.waitForResponse(
      (res) => {
        const req = res.request()
        const method = req.method()

        // ✅ preflight(OPTIONS) 같은 건 무시하고, 실제 GET만 대상으로 함
        if (method !== 'GET') return false

        const cd = res.headers()['content-disposition'] ?? ''
        const ct = res.headers()['content-type'] ?? ''

        return /attachment/i.test(cd) || /excel|spreadsheet|octet-stream/i.test(ct)
      },
      { timeout: 60_000 }
    )

    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('a, button'))

      const btn = candidates.find((el) => {
        const text = (el.textContent ?? '').trim()
        if (!text) return false
        return text.includes('엑셀') || text.includes('다운로드')
      })

      if (btn) {
        btn.click()
      }
    })

    const resp = await respPromise
    const anyResp = resp as unknown as {
      buffer?: () => Promise<Buffer>
      arrayBuffer?: () => Promise<ArrayBuffer>
    }

    let nodeBuf: Buffer

    if (typeof anyResp.buffer === 'function') {
      // puppeteer Response (구버전 스타일)
      nodeBuf = await anyResp.buffer()
    } else if (typeof anyResp.arrayBuffer === 'function') {
      // puppeteer 최신 또는 fetch 스타일
      const ab = await anyResp.arrayBuffer()
      nodeBuf = Buffer.from(ab)
    } else {
      throw new Error('응답 객체에 buffer()/arrayBuffer()가 없습니다.')
    }

    const buf = new Uint8Array(nodeBuf)

    if (!buf || buf.length < 100) {
      throw new Error('엑셀 응답이 비정상입니다.')
    }
    return buf
  } finally {
    await page.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}
