import { supabase } from "@/integrations/supabase/client";

/**
 * Security utility to get the authenticated user's session with JWT token
 * This ensures all API calls include proper authentication
 */
export async function getAuthenticatedSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.error('Auth session error:', error);
    throw new Error('Failed to get authentication session');
  }
  
  if (!session?.access_token) {
    throw new Error('No valid authentication session found');
  }
  
  return session;
}

/**
 * Makes authenticated function calls to Supabase Edge Functions
 * Automatically includes the JWT token for security
 */
export async function callAuthenticatedFunction<T = any>(
  functionName: string, 
  body: Record<string, any>
): Promise<T> {
  const session = await getAuthenticatedSession();
  
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  
  if (error) {
    console.error(`Function ${functionName} error:`, error);
    throw new Error(error.message || error.toString());
  }
  
  return data as T;
}

/**
 * Stream authenticated function calls with JWT token
 */
export async function streamAuthenticatedFunction(
  functionName: string,
  body: Record<string, any>
): Promise<ReadableStream> {
  const session = await getAuthenticatedSession();
  
  const response = await fetch(`https://ukznsekygmipnucpouoy.supabase.co/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Stream function ${functionName} error:`, errorText);
    throw new Error(`Function call failed: ${response.status} ${response.statusText}`);
  }
  
  if (!response.body) {
    throw new Error('No response stream available');
  }
  
  return response.body;
}