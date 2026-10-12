// Upstash Redis over plain HTTPS (REST). No extra dependency: it is just `fetch`.
//
// Why: Vercel's disk is read-only and wiped between requests, so alerts, voice notes and photos
// cannot live in files there. Upstash Redis (free, added from the Vercel Marketplace) keeps them.
//
// The Vercel integration adds KV_REST_API_URL + KV_REST_API_TOKEN. Upstash's own dashboard uses
// UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN. Either pair works here.

export function redisFromEnv(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? createRedis(url, token) : null;
}

export function createRedis(url, token) {
  /** Run one Redis command, e.g. cmd("SET", "key", "value", "EX", 60). */
  async function cmd(...args) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(`Redis ${args[0]} failed: ${body.error || res.status}`);
    return body.result;
  }
  return { cmd, token };
}
