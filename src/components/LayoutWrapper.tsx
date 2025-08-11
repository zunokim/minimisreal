// src/components/LayoutWrapper.tsx
'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import LogoutButton from '@/components/LogoutButton'

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname.startsWith('/login')
  const [menuOpen, setMenuOpen] = useState(false)

  // ✅ 프로필(이름/이메일)
  const [displayName, setDisplayName] = useState<string>('')
  const [email, setEmail] = useState<string>('')

  // 로딩 상태 (문구 깜빡임 방지)
  const [loadingProfile, setLoadingProfile] = useState<boolean>(true)

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

  // 이니셜 생성
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
            Code_31020
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
                  {/* 환영 텍스트 - 이름/이메일만 클릭 가능 (가시성 강화) */}
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
        <aside className="hidden md:block w-56 bg-gray-100 p-4 border-r">
          <nav className="flex flex-col gap-4 font-bold">
            <Link href="/">🏠 Home</Link>
            <Link href="/board">📝 Board</Link>
            <Link href="/data">📊 Data</Link>
            <Link href="/etc">⚙️ Etc</Link>
          </nav>
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

      {/* 모바일: 우측 슬라이드 메뉴 + 하단 프로필 */}
      <aside
        className={[
          'fixed top-16 right-0 h-[calc(100vh-64px)] w-64 bg-white border-l shadow-xl md:hidden z-50',
          'transition-transform duration-300',
          menuOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <nav className="flex flex-col gap-4 font-bold p-4">
          <Link href="/" onClick={() => setMenuOpen(false)}>🏠 Home</Link>
          <Link href="/board" onClick={() => setMenuOpen(false)}>📝 Board</Link>
          <Link href="/data" onClick={() => setMenuOpen(false)}>📊 Data</Link>
          <Link href="/etc" onClick={() => setMenuOpen(false)}>⚙️ Etc</Link>
        </nav>

        {/* 📇 프로필(모바일 전용 표기) */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t text-sm text-gray-600 md:hidden">
          {(displayName || email) ? (
            <>
              <div className="font-semibold">
                <Link
                  href="/account"
                  onClick={() => setMenuOpen(false)}
                  className="text-blue-600 font-semibold underline decoration-2 underline-offset-2 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded-sm px-0.5"
                  title="프로필/비밀번호 변경"
                >
                  {displayName || email}
                </Link>
              </div>
              {displayName && email && (
                <div className="text-xs text-gray-500 mt-0.5">{email}</div>
              )}
            </>
          ) : (
            <div className="font-semibold">로그인 정보 없음</div>
          )}
        </div>
      </aside>
    </>
  )
}
