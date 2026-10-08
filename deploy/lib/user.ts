import 'server-only'
import { cookies } from 'next/headers'

const COOKIE = 'trailhead_uid'

// Memory is scoped by userId, so it must come from the server — never from the request body, where anyone could
// claim to be someone else. This demo has no login: each browser gets a random id in an httpOnly cookie.
// In a real app, use the id of the signed-in user from your auth provider instead.
export async function getUserId({ create }: { create: boolean }) {
  const jar = await cookies()
  const existing = jar.get(COOKIE)?.value
  if (existing || !create) return existing
  const id = `user-${crypto.randomUUID()}`
  jar.set(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 })
  return id
}
