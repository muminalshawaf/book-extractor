// Helper to call Supabase Edge Functions
import { supabase } from "@/integrations/supabase/client";

export async function callFunction<T = any>(
  name: string, 
  body: Record<string, any>, 
  options: { timeout?: number; retries?: number } = {}
): Promise<T> {
  const { timeout = 180000, retries = 3 } = options; // 3 minute timeout, 3 retries
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`Calling function ${name} (attempt ${attempt + 1}/${retries + 1})`);
      
      // Use a more reliable direct fetch approach for long-running functions
      if (name === 'summarize' && timeout > 120000) {
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch(`https://ukznsekygmipnucpouoy.supabase.co/functions/v1/${name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || 'anon-key'}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrem5zZWt5Z21pcG51Y3BvdW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MjY4NzMsImV4cCI6MjA3MDIwMjg3M30.5gvy46gGEU-B9O3cutLNmLoX62dmEvKLC236yeaQ6So'
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        const data = await response.json();
        console.log(`Function ${name} succeeded on attempt ${attempt + 1}`);
        return data as T;
      }
      
      // Standard Supabase client approach for other functions
      const { data, error } = await supabase.functions.invoke(name, { body });
      
      if (error) {
        console.error(`Function ${name} error (attempt ${attempt + 1}):`, error);
        if (attempt === retries) {
          throw new Error(error.message || error.toString());
        }
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
      
      if (data != null) {
        console.log(`Function ${name} succeeded on attempt ${attempt + 1}`);
        return data as T;
      }
      
      throw new Error(`Function ${name} returned null data`);
    } catch (err: any) {
      console.error(`Failed to call function ${name} (attempt ${attempt + 1}):`, err);
      
      if (attempt === retries) {
        throw new Error(err.message || `Failed to call function ${name} after ${retries + 1} attempts`);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  throw new Error(`Function ${name} failed after all attempts`);
}

