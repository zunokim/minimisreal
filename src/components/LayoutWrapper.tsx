// src/components/LayoutWrapper.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname.startsWith('/login')
  const [menuOpen, setMenuOpen] = useState(false)

  // 로그인 페이지가 아닐 때, 로그인 유저의 profiles 행 보정(없으면 생성)
  useEffect(() => {
    if (isLoginPage) return
    fetch('/api/ensure-profile', { cache: 'no-store', credentials: 'include' }).catch(() => {})
  }, [isLoginPage])

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

  // 로그인 페이지는 중앙 정렬만
  if (isLoginPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        {children}
      </div>
    )
  }

  return (
    <>
      {/* 고정 헤더 */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white shadow-md border-b z-50">
        <div className="h-full px-4 md:px-6 flex items-center justify-between">
          {/* 좌측 타이틀 */}
          <h1 className="text-lg md:text-xl font-bold">Code Name 31020</h1>

          {/* 우측: Profile(필요 시 유지) + Logout + 햄버거 */}
          <div className="flex items-center gap-3">
            {/* 필요 없으면 아래 Link 제거해도 됩니다 */}
            <Link href="/profile" className="hidden md:inline text-sm hover:underline">
              👤 Profile
            </Link>
            <LogoutButton />
            <button
              type="button"
              aria-label="메뉴 열기"
              className="md:hidden p-2 border rounded hover:bg-gray-50 active:scale-95 transition"
              onClick={() => setMenuOpen(true)}
            >
              <span className="block w-5 h-0.5 bg-black mb-1" />
              <span className="block w-5 h-0.5 bg-black mb-1" />
              <span className="block w-5 h-0.5 bg-black" />
            </button>
          </div>
        </div>
      </header>

      {/* 헤더 높이 보정 */}
      <div className="pt-16 flex min-h-screen">
        {/* 좌측 사이드바 — 데스크탑 */}
        <aside className="hidden md:block w-56 bg-gray-100 p-4 border-r">
          <nav className="flex flex-col gap-4 font-bold">
            <Link href="/">🏠 Home</Link>
            <Link href="/board">📝 Board</Link>
            <Link href="/data">📊 Data</Link>
            <Link href="/etc">⚙️ Etc</Link>
            {/* ⛔️ Profile 링크는 좌측 메뉴에서 제거 */}
          </nav>
        </aside>

        {/* 본문 */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      {/* 모바일 오버레이 */}
      {menuOpen && (
        <button
          aria-label="메뉴 닫기"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 bg-black/30 backdrop-blur-[1px] md:hidden z-40"
        />
      )}

      {/* 모바일 슬라이드 메뉴 */}
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
          {/* 모바일 메뉴에서도 Profile 제거 */}
        </nav>
      </aside>
    </>
  )
}
