// Helper to call Supabase Edge Functions
import { supabase } from "@/integrations/supabase/client";

export async function callFunction<T = any>(
  name: string, 
  body: Record<string, any>, 
  options: { timeout?: number; retries?: number } = {}
): Promise<T> {
  const { timeout = 120000, retries = 2 } = options; // 2 minute timeout, 2 retries
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`Calling function ${name} (attempt ${attempt + 1}/${retries + 1})`);
      
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Function ${name} timed out after ${timeout}ms`)), timeout);
      });
      
      // Create function call promise
      const functionPromise = supabase.functions.invoke(name, { body });
      
      // Race between timeout and function call
      const result = await Promise.race([functionPromise, timeoutPromise]) as any;
      const { data, error } = result;
      
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

