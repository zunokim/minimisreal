// ✅ src/app/login/layout.tsx
import '../globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'

export const metadata: Metadata = {
  title: '로그인 페이지',
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 font-ridi">
      {children}
    </div>
  )
}
