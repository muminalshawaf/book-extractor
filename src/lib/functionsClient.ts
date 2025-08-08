// Lightweight helper to call Supabase Edge Functions with graceful fallbacks
// Order:
// 1) supabase-js functions.invoke if available
// 2) Absolute Supabase Functions URL via env (Authorization: Bearer anon key)
// 3) Relative /functions/v1 fallback (dev proxy)

export async function callFunction<T = any>(name: string, body: Record<string, any>): Promise<T> {
  // 1) Try supabase-js dynamically to avoid build-time env errors
  try {
    const mod = await import("@/lib/supabase");
    const supabase = (mod as any).supabase as {
      functions: { invoke: (fn: string, opts: { body?: any }) => Promise<{ data: T | null; error: any }> };
    };
    if (supabase?.functions?.invoke) {
      const { data, error } = await supabase.functions.invoke(name, { body });
      if (error) throw error;
      if (data != null) return data as T;
    }
  } catch (_) {
    // ignore and try HTTP-based fallbacks
  }

  // 2) Absolute URL using env vars (works even if /functions proxy isn't wired)
  try {
    // Using import.meta.env directly here avoids importing the supabase client which may throw
    // eslint-disable-next-line no-undef
    const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    // eslint-disable-next-line no-undef
    const anon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (url && anon) {
      const abs = `${url.replace(/\/$/, '')}/functions/v1/${name}`;
      const res = await fetch(abs, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anon}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return (await res.json()) as T;
      // fall through to relative if 404/other
    }
  } catch (_) {
    // ignore and try relative fallback
  }

  // 3) Relative fallback (works when dev proxy is configured)
  const res = await fetch(`/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Function ${name} HTTP ${res.status}`);
  return (await res.json()) as T;
}

