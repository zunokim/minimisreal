import { NextResponse, NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PREFIXES = [
  '/login',        // /login, /login/success 허용
  '/api',          // API는 미들웨어 통과 (로그인/로그아웃/날씨 등)
  '/_next',        // Next 정적 리소스
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
]

// middleware는 async 가능
export async function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl

  // 정적/공개 경로는 통과
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // 기본 응답을 먼저 준비 (여기에 쿠키 갱신을 세팅할 것)
  const res = NextResponse.next()

  // Supabase 서버 클라이언트 생성 (+ 쿠키 자동 읽기/쓰기)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // 토큰 갱신 시 Set-Cookie를 현재 응답(res)에 심어줌
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  // 실제 사용자 확인 (토큰이 만료되어도 여기서 자동 갱신 시도)
  const { data: { user }, error } = await supabase.auth.getUser()

  // 비로그인 → /login
  if (!user) {
    const url = new URL('/login', origin)
    // 원래 가려던 경로 저장하고 싶으면 아래 주석 해제
    // url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // 로그인 상태면 통과 (갱신된 쿠키가 있으면 res로 함께 반환됨)
  return res
}

// 모든 경로에 적용하되, 정적 리소스는 앞에서 걸러짐
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
