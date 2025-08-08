// Helper to call Supabase Edge Functions
import { supabase } from "@/integrations/supabase/client";

export async function callFunction<T = any>(name: string, body: Record<string, any>): Promise<T> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    
    if (error) {
      console.error(`Function ${name} error:`, error);
      throw new Error(error.message || error.toString());
    }
    
    if (data != null) {
      return data as T;
    }
    
    throw new Error(`Function ${name} returned null data`);
  } catch (err: any) {
    console.error(`Failed to call function ${name}:`, err);
    throw new Error(err.message || `Failed to call function ${name}`);
  }
}

