'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname.startsWith('/login')

  // 모바일 메뉴 열림/닫힘 상태
  const [menuOpen, setMenuOpen] = useState(false)

  // ESC로 닫기 & 라우트 변경 시 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    // 페이지 이동하면 모바일 메뉴 자동 닫기
    setMenuOpen(false)
  }, [pathname])

  // 로그인 페이지는 헤더/사이드바 없이 중앙정렬만
  if (isLoginPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        {children}
      </div>
    )
  }

  return (
    <>
      {/* 상단 헤더 */}
      <header className="w-full px-4 md:px-6 py-4 bg-white shadow-md border-b">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          {/* 좌측: 로고/타이틀 */}
          <h1 className="text-lg md:text-xl font-bold">Code Name 31020</h1>

          {/* 우측: 로그아웃 + (모바일) 햄버거 버튼 */}
          <div className="flex items-center gap-3">
            <LogoutButton />
            {/* 모바일 햄버거 버튼 — 우측 상단 고정 */}
            <button
              type="button"
              aria-label="메뉴 열기"
              className="md:hidden p-2 border rounded hover:bg-gray-50 active:scale-95 transition"
              onClick={() => setMenuOpen(true)}
            >
              {/* 간단한 햄버거 아이콘 */}
              <span className="block w-5 h-0.5 bg-black mb-1" />
              <span className="block w-5 h-0.5 bg-black mb-1" />
              <span className="block w-5 h-0.5 bg-black" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)]">
        {/* 좌측 사이드바 — 데스크탑 전용 */}
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

      {/* --- 모바일 전용 오버레이 & 우측 슬라이드 메뉴 --- */}
      {/* 오버레이 */}
      {menuOpen && (
        <button
          aria-label="메뉴 닫기"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 bg-black/30 backdrop-blur-[1px] md:hidden z-40"
        />
      )}

      {/* 우측 슬라이드 드로어 */}
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
      </aside>
    </>
  )
}
