// src/components/LayoutWrapper.tsx
'use client'

import { ReactNode, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname.startsWith('/login')

  const [menuOpen, setMenuOpen] = useState(false)

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
      <header className="w-full px-6 py-4 bg-white shadow-md flex justify-between items-center border-b">
        <h1 className="text-xl font-bold">Code Name 31020</h1>
        <div className="flex items-center gap-4">
          {/* 모바일 메뉴 버튼 */}
          <button
            className="md:hidden p-2 border rounded"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            ☰
          </button>
          <LogoutButton />
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)]">
        {/* 좌측 메뉴 - 데스크탑 */}
        <aside className="hidden md:block w-52 bg-gray-100 p-4 border-r">
          <nav className="flex flex-col gap-4 font-bold">
            <Link href="/">🏠 Home</Link>
            <Link href="/board">📝 Board</Link>
            <Link href="/data">📊 Data</Link>
            <Link href="/etc">⚙️ Etc</Link>
          </nav>
        </aside>

        {/* 모바일 메뉴 - 슬라이드 */}
        {menuOpen && (
          <aside className="absolute top-16 left-0 w-48 bg-gray-100 p-4 border-r shadow-md md:hidden z-50">
            <nav className="flex flex-col gap-4 font-bold">
              <Link href="/" onClick={() => setMenuOpen(false)}>🏠 Home</Link>
              <Link href="/board" onClick={() => setMenuOpen(false)}>📝 Board</Link>
              <Link href="/data" onClick={() => setMenuOpen(false)}>📊 Data</Link>
              <Link href="/etc" onClick={() => setMenuOpen(false)}>⚙️ Etc</Link>
            </nav>
          </aside>
        )}

        {/* 본문 */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </>
  )
}
