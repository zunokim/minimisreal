// ✅ src/components/LayoutWrapper.tsx
'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname.startsWith('/login')

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
        <LogoutButton />
      </header>

      {/* 좌측 메뉴 + 본문 */}
      <div className="flex h-[calc(100vh-64px)]">
        {/* 좌측 메뉴 고정 */}
        <aside className="w-52 bg-gray-100 p-4 border-r">
          <nav className="flex flex-col gap-4 font-bold">
            <a href="/">🏠 Home</a>
            <a href="/board">📝 Board</a>
            <a href="/data">📊 Data</a>
            <a href="/etc">⚙️ Etc</a>
          </nav>
        </aside>

        {/* 페이지 본문 */}
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </>
  )
}
