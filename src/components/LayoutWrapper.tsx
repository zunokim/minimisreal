// src/components/LayoutWrapper.tsx
'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import LogoutButton from '@/components/LogoutButton'

// lucide-react 아이콘
import { Home, FileText, BarChart3, Newspaper, Settings, Calendar } from 'lucide-react'

type NavItem = { name: string; href: string; icon: React.ReactNode }

const navItems: NavItem[] = [
  { name: 'Home',     href: '/',        icon: <Home className="w-4 h-4" /> },
  { name: 'Board',    href: '/board',   icon: <FileText className="w-4 h-4" /> },
  { name: 'Data',     href: '/data',    icon: <BarChart3 className="w-4 h-4" /> },
  { name: 'News',     href: '/news',    icon: <Newspaper className="w-4 h-4" /> },
  { name: 'Schedule', href: '/schedule',icon: <Calendar className="w-4 h-4" /> }, // ✅ 추가
  { name: 'Etc',      href: '/etc',     icon: <Settings className="w-4 h-4" /> },
]

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname.startsWith('/login')

  // ✅ 상태
  const [menuOpen, setMenuOpen] = useState(false)
  const [displayName, setDisplayName] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [loadingProfile, setLoadingProfile] = useState<boolean>(true)

  // ✅ 프로필 로드
  const loadProfile = async () => {
    setLoadingProfile(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setDisplayName('')
      setEmail('')
      setLoadingProfile(false)
      return
    }

    setEmail(user.email ?? '')

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()

    setDisplayName(profile?.display_name || '')
    setLoadingProfile(false)
  }

  useEffect(() => {
    loadProfile()
  }, [])

  // 프로필 변경 브로드캐스트 수신 → 즉시 반영
  useEffect(() => {
    const handler = () => loadProfile()
    window.addEventListener('profile-updated', handler as EventListener)
    return () => window.removeEventListener('profile-updated', handler as EventListener)
  }, [])

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 라우트 변경 시 닫기
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // 이니셜
  const initials = useMemo(() => {
    const base = displayName || email || ''
    if (!base) return ''
    const parts = base.trim().split(/\s+/)
    const first = parts[0]?.[0] || ''
    const second = parts.length > 1 ? parts[1]?.[0] || '' : ''
    return (first + second).toUpperCase()
  }, [displayName, email])

  // 환영 문구
  const welcomeText = useMemo(() => {
    if (loadingProfile) return ''
    if (displayName) return `${displayName}님 환영합니다!`
    if (email) return `${email}님 환영합니다!`
    return ''
  }, [displayName, email, loadingProfile])

  // ✅ 활성 경로 매핑 (항상 훅을 동일 순서로 호출하기 위해 조기 return "위"에 위치)
  const activeMap = useMemo(() => {
    const map: Record<string, boolean> = {}
    navItems.forEach((it) => {
      map[it.href] =
        pathname === it.href ||
        (it.href !== '/' && pathname.startsWith(it.href + '/'))
    })
    return map
  }, [pathname])

  // 로그인 페이지만 중앙 정렬
  if (isLoginPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        {children}
      </div>
    )
  }

  return (
    <>
      {/* 🔒 고정 헤더 */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white shadow-md border-b z-50">
        <div className="h-full px-4 md:px-6 flex items-center justify-between gap-3">
          {/* 좌측: 타이틀 */}
          <h1 className="font-bold truncate text-[clamp(16px,3.5vw,20px)]">
            31020_LAB
          </h1>

          {/* 우측: 환영문구(데스크탑) + 로그아웃 + 햄버거 */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* 데스크탑 환영 배지 */}
            <div className="hidden md:flex items-center">
              {loadingProfile ? (
                <div
                  aria-hidden="true"
                  className="h-9 w-48 rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse"
                />
              ) : welcomeText ? (
                <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border bg-white shadow-sm">
                  {/* 아바타(이니셜) */}
                  <div
                    aria-hidden="true"
                    className="flex h-7 w-7 items-center justify-center rounded-full border bg-gradient-to-br from-gray-50 to-gray-100 text-xs font-semibold text-gray-700"
                    title={displayName || email}
                  >
                    {initials || 'U'}
                  </div>
                  {/* 환영 텍스트 */}
                  <span className="text-[13px] font-medium text-gray-700">
                    <Link
                      href="/account"
                      className="text-blue-600 font-semibold underline decoration-2 underline-offset-2 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded-sm px-0.5"
                      title="프로필/비밀번호 변경"
                    >
                      {displayName || email}
                    </Link>
                    님 환영합니다!
                  </span>
                </div>
              ) : null}
            </div>

            {/* 로그아웃 */}
            <LogoutButton />

            {/* 햄버거 (모바일 전용) */}
            <button
              type="button"
              aria-label="메뉴 열기"
              className="md:hidden p-2 border rounded hover:bg-gray-50 active:scale-95 transition whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
              onClick={() => setMenuOpen(true)}
            >
              <span className="block w-5 h-0.5 bg-black mb-1" />
              <span className="block w-5 h-0.5 bg-black mb-1" />
              <span className="block w-5 h-0.5 bg-black" />
            </button>
          </div>
        </div>
      </header>

      {/* 헤더 높이만큼 여백 */}
      <div className="pt-16 flex min-h-screen">
        {/* 좌측 사이드바 — 데스크탑 */}
        <aside className="hidden md:flex w-64 border-r bg-white flex-col">
          <nav className="px-3 py-4 flex-1">
            <ul className="space-y-1">
              {navItems.map((it) => {
                const active = !!activeMap[it.href]
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-all',
                        active
                          ? 'bg-gray-100 border-gray-300 text-black'
                          : 'bg-white border-transparent text-gray-700 hover:bg-gray-50 hover:border-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300',
                      ].join(' ')}
                    >
                      {it.icon}
                      <span className="font-medium">{it.name}</span>

                      {/* 활성 표시 바 */}
                      <span
                        className={[
                          'ml-auto h-4 w-1 rounded-full',
                          active ? 'bg-black' : 'bg-transparent group-hover:bg-gray-300',
                        ].join(' ')}
                      />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* 하단 푸터 */}
          <div className="border-t px-4 py-3 text-[11px] text-gray-400">
            2025 miniMIS by zuno
          </div>
        </aside>

        {/* 본문 */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      {/* 모바일: 오버레이 */}
      {menuOpen && (
        <button
          aria-label="메뉴 닫기"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 bg-black/30 backdrop-blur-[1px] md:hidden z-40"
        />
      )}

      {/* 모바일: 우측 슬라이드 메뉴 + 하단 푸터 */}
      <aside
        className={[
          'fixed top-16 right-0 h-[calc(100vh-64px)] w-64 bg-white border-l shadow-xl md:hidden z-50',
          'transition-transform duration-300',
          menuOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <nav className="flex flex-col gap-2 font-semibold p-4 flex-1">
          {navItems.map((it) => {
            const active = !!activeMap[it.href]
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={[
                  'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-all',
                  active
                    ? 'bg-gray-100 border-gray-300 text-black'
                    : 'bg-white border-transparent text-gray-700 hover:bg-gray-50 hover:border-gray-200',
                ].join(' ')}
              >
                {it.icon}
                <span>{it.name}</span>
                <span
                  className={[
                    'ml-auto h-4 w-1 rounded-full',
                    active ? 'bg-black' : 'bg-transparent group-hover:bg-gray-300',
                  ].join(' ')}
                />
              </Link>
            )
          })}
        </nav>

        <div className="border-t px-4 py-3 text-[11px] text-gray-400">
          2025 miniMIS by zuno
        </div>
      </aside>
    </>
  )
}
