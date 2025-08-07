// ✅ src/app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'
import LayoutWrapper from '@/components/LayoutWrapper'

export const metadata: Metadata = {
  title: 'S T R A T E G Y',
  description: '개인 웹페이지 - 로그인, 게시판, 날씨 연동',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="font-ridi text-black">
        <LayoutWrapper>{children}</LayoutWrapper>
      </body>
    </html>
  )
}
