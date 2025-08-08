// ✅ src/app/login/layout.tsx
import '../globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'S T R A T E G Y',
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 font-ridi">
      {children}
    </div>
  )
}
