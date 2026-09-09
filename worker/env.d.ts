/** Optional binding retained for the starter's opt-in D1 example. This Site has no database. */
declare namespace Cloudflare {
  interface Env { DB?: D1Database; }
}
