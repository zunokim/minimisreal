// ✅ src/components/LayoutWrapper.tsx
'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import Link from 'next/link'

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
        <aside className="w-52 bg-gray-100 p-4 border-r">
          <nav className="flex flex-col gap-4 font-bold">
            <Link href="/">🏠 Home</Link>
            <Link href="/board">📝 Board</Link>
            <Link href="/data">📊 Data</Link>
            <Link href="/etc">⚙️ Etc</Link>
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </>
  )
}
