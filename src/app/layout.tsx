// ✅ src/app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import LayoutWrapper from '@/components/LayoutWrapper'

export const metadata: Metadata = {
  title: 'Just Do It',
  description: '개인 웹페이지 - 로그인, 게시판, 날씨 연동',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <LayoutWrapper>{children}</LayoutWrapper>
      </body>
    </html>
  )
}
