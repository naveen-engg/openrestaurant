import { headers } from "next/headers";

/**
 * Get the base URL for the application dynamically
 * Works both server-side and client-side without requiring environment variables
 */

export async function getBaseUrl(): Promise<string> {
  // Client-side: use window.location
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  // Server-side: try to get from headers
  if (typeof process !== 'undefined') {
    try {
      // Import headers from next/headers (only works in app directory)
      const headersList = await headers();
      
      // Try x-forwarded-host first (common in production deployments)
      const host = headersList.get('x-forwarded-host') || headersList.get('host');
      const protoHeader = headersList.get('x-forwarded-proto');
      const isLocalOrIp = host && (host.includes('localhost') || /^\d+\.\d+\.\d+\.\d+/.test(host));
      const protocol = protoHeader || (isLocalOrIp ? 'http' : (process.env.NODE_ENV === 'production' ? 'https' : 'http'));

      if (host) {
        return `${protocol}://${host}`;
      }
    } catch (e) {
      // headers() might not be available in all contexts (e.g., API routes, background)
      // Fall through to default
    }
  }

  // Server-side fallback - return internal localhost origin so GraphQL requests succeed
  const port = process.env.PORT || 3000;
  return `http://127.0.0.1:${port}`;
}

/**
 * Get the GraphQL endpoint URL
 */
export async function getGraphQLEndpoint(): Promise<string> {
  const baseUrl = await getBaseUrl();
  return `${baseUrl}/api/graphql`;
}
