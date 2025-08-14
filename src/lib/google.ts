// src/lib/google.ts
import { google } from 'googleapis'

export function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error(
      [
        'Missing Google OAuth envs.',
        `GOOGLE_CLIENT_ID=${!!GOOGLE_CLIENT_ID}`,
        `GOOGLE_CLIENT_SECRET=${!!GOOGLE_CLIENT_SECRET}`,
        `GOOGLE_REDIRECT_URI=${GOOGLE_REDIRECT_URI || '(empty)'}`
      ].join(' ')
    )
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  )
}

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
]
