import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint, headers, requestBody, method = 'POST' } = body;

    if (!endpoint || !headers) {
      return NextResponse.json(
        { error: 'Missing endpoint or headers' },
        { status: 400 }
      );
    }

    console.log(`[API Route] Method: ${method}, Endpoint: ${endpoint}`);

    const fetchOptions: RequestInit = {
      method: method,
      headers: headers,
    };

    // Only add body if it's not a GET request and body is provided
    if (method !== 'GET' && requestBody && Object.keys(requestBody).length > 0) {
      fetchOptions.body = JSON.stringify(requestBody);
    }

    const response = await fetch(endpoint, fetchOptions);

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!response.ok) {
      const errorBody = isJson
        ? await response.json().catch(() => ({}))
        : await response.text().catch(() => '');
      let message: string;
      if (isJson) {
        const raw = errorBody?.error?.message || errorBody?.error || JSON.stringify(errorBody);
        message = String(raw).substring(0, 300);
      } else {
        const text = String(errorBody);
        const looksLikeHtml = /<(!DOCTYPE|html|head|body)\b/i.test(text);
        if (looksLikeHtml) {
          // HTML error pages (Next.js, nginx, etc.) are not useful to surface — return a clean message
          message = `API server returned an HTML error page (status ${response.status}). The server may be down or misconfigured.`;
        } else {
          message = text.trim().substring(0, 300);
        }
      }
      console.error(`[API Route] Error ${response.status} from ${endpoint}:`, message);
      return NextResponse.json(
        { error: message || `API request failed with status ${response.status}` },
        { status: response.status }
      );
    }

    if (!isJson) {
      const text = await response.text();
      console.warn(`[API Route] Non-JSON success response from ${endpoint}`);
      return NextResponse.json({ text });
    }

    const data = await response.json();
    console.log(`[API Route] Success response from ${endpoint}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Route] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
