import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  isLoggedIn: boolean;
}

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export const sessionOptions = {
  password: process.env.AUTH_SECRET!,
  cookieName: 'et-session',
  ttl: SESSION_TTL,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_TTL,
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
