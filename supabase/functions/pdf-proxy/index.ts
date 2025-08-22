import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Allowlisted hosts for security
const ALLOWED_HOSTS = ['ksa.idros.ai'];

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate the target URL is from an allowed host
    const targetUrlObj = new URL(targetUrl);
    if (!ALLOWED_HOSTS.includes(targetUrlObj.hostname)) {
      return new Response(JSON.stringify({ error: 'Host not allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Forward important headers from the original request
    const proxyHeaders: Record<string, string> = {
      'User-Agent': req.headers.get('User-Agent') || 'Mozilla/5.0 (compatible; PDF-Proxy)',
      'Accept': 'application/pdf,*/*',
      'Referer': 'https://ksa.idros.ai/',
    };

    // Forward Range header for partial content requests (important for large PDFs)
    const rangeHeader = req.headers.get('Range');
    if (rangeHeader) {
      proxyHeaders['Range'] = rangeHeader;
    }

    console.log('Proxying PDF request to:', targetUrl);

    // Fetch the PDF from the target server
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: proxyHeaders,
    });

    if (!response.ok) {
      console.error('Failed to fetch PDF:', response.status, response.statusText);
      return new Response(JSON.stringify({ 
        error: `Failed to fetch PDF: ${response.status} ${response.statusText}` 
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare response headers
    const responseHeaders = new Headers(corsHeaders);
    
    // Forward important response headers
    const contentType = response.headers.get('Content-Type');
    if (contentType) {
      responseHeaders.set('Content-Type', contentType);
    } else {
      responseHeaders.set('Content-Type', 'application/pdf');
    }

    const contentLength = response.headers.get('Content-Length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    const acceptRanges = response.headers.get('Accept-Ranges');
    if (acceptRanges) {
      responseHeaders.set('Accept-Ranges', acceptRanges);
    }

    const contentRange = response.headers.get('Content-Range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    const contentDisposition = response.headers.get('Content-Disposition');
    if (contentDisposition) {
      responseHeaders.set('Content-Disposition', contentDisposition);
    }

    // Add caching headers for better performance
    responseHeaders.set('Cache-Control', 'public, max-age=3600');

    console.log('Successfully proxied PDF, content-type:', contentType);

    // Stream the PDF response
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('PDF proxy error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error while proxying PDF' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});