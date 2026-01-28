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

    const data = await response.json();

    if (!response.ok) {
      console.error(`[API Route] Error response from ${endpoint}:`, data);
      return NextResponse.json(
        { error: data?.error?.message || 'API request failed' },
        { status: response.status }
      );
    }

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
