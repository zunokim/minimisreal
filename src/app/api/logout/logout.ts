// src/pages/api/logout.ts
import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Set-Cookie', 'sb-access-token=; Max-Age=0; Path=/; HttpOnly')
  res.status(200).json({ message: 'Logged out' })
}
