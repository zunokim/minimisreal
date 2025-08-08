// src/components/LayoutWrapper.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import LogoutButton from '@/components/LogoutButton'

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname.startsWith('/login')
  const [menuOpen, setMenuOpen] = useState(false)

  // ✅ 프로필(이름/이메일) — 모바일 사이드바 하단에서 사용
  const [displayName, setDisplayName] = useState<string>('')
  const [email, setEmail] = useState<string>('')

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setDisplayName('')
        setEmail('')
        return
      }
      setEmail(user.email ?? '')
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single()
      setDisplayName(profile?.display_name || '')
    }
    loadProfile()
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
      {/* 🔒 고정 헤더 */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white shadow-md border-b z-50">
        <div className="h-full px-4 md:px-6 flex items-center justify-between gap-3">
          {/* 좌측: 타이틀 */}
          <h1 className="font-bold truncate text-[clamp(16px,3.5vw,20px)]">Code Name 31020</h1>

          {/* 우측: 로그아웃 + 햄버거 */}
          <div className="flex items-center gap-2">
            <LogoutButton />
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
          <div className="font-semibold">
            {displayName || email || '로그인 정보 없음'}
          </div>
          {displayName && email && (
            <div className="text-xs text-gray-500 mt-0.5">{email}</div>
          )}
        </div>
      </aside>
    </>
  )
}
