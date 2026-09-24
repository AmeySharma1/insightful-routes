/**
 * Accepts access tokens issued by the dashboard's hosted sign-in (Google).
 * The token is validated by asking the auth server who it belongs to, and the
 * answer is cached briefly so each request doesn't round-trip.
 */
const cache = new Map<string, { userId: string; email: string | null; exp: number }>();

export const supabaseAuthEnabled = (): boolean => !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY;

export const verifySupabaseToken = async (token: string): Promise<{ userId: string; email: string | null } | null> => {
  if (!supabaseAuthEnabled()) return null;
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit;
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY! },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string; email?: string };
    if (!user.id) return null;
    const entry = { userId: user.id, email: user.email ?? null, exp: Date.now() + 60_000 };
    cache.set(token, entry);
    if (cache.size > 5000) cache.clear();
    return entry;
  } catch {
    return null;
  }
};

/** Local testing only: AUTH_DISABLED=true skips auth. Never honoured in production. */
export const devAuthBypass = (): boolean => process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";
