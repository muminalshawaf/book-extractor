// Lightweight helper to call Supabase Edge Functions with graceful fallbacks
// 1) Try supabase-js functions.invoke (if env vars are available)
// 2) Fallback to relative fetch(`/functions/v1/${name}`)

export async function callFunction<T = any>(name: string, body: Record<string, any>): Promise<T> {
  // Try supabase-js dynamically to avoid build-time env errors
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
  } catch (e) {
    // ignore and try HTTP fallback
  }

  // HTTP fallback
  const res = await fetch(`/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Function ${name} HTTP ${res.status}`);
  return (await res.json()) as T;
}
