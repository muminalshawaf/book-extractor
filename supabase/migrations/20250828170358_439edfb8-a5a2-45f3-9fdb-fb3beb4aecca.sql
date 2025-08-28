-- Update RLS policies for page_summaries to be more secure
-- Remove the overly permissive policy and add proper user-based access

DROP POLICY IF EXISTS "Public can read page summaries" ON public.page_summaries;

-- Create more restrictive policies
-- Only allow reading summaries (keeping it public for now but with audit logging)
CREATE POLICY "Authenticated users can read page summaries" 
ON public.page_summaries 
FOR SELECT 
TO authenticated
USING (true);

-- Add policies to prevent unauthorized modifications
CREATE POLICY "No public insert on page summaries" 
ON public.page_summaries 
FOR INSERT 
TO authenticated
WITH CHECK (false);

CREATE POLICY "No public update on page summaries" 
ON public.page_summaries 
FOR UPDATE 
TO authenticated
USING (false);

CREATE POLICY "No public delete on page summaries" 
ON public.page_summaries 
FOR DELETE 
TO authenticated
USING (false);

-- Create audit log table for security monitoring
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can read audit logs (for admin purposes)
CREATE POLICY "Only service role can access audit logs" 
ON public.security_audit_logs 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);