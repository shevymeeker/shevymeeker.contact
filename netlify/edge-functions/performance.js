/**
 * Performance edge function — runs at Netlify's CDN edge before the response
 * is sent to the browser. Injects critical resource hints at the HTTP layer
 * so the browser can open connections and start fetching before HTML is parsed.
 */
export default async (req, context) => {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";

  // Only enhance HTML responses
  if (!contentType.includes("text/html")) {
    return response;
  }

  const headers = new Headers(response.headers);

  // HTTP-layer preconnect + preload hints — these fire before a single byte of
  // HTML is parsed, giving the browser a head-start on DNS + TLS handshakes
  // to the Google Fonts CDN. Stacking multiple Link values is valid per RFC 8288.
  headers.append(
    "Link",
    '<https://fonts.googleapis.com>; rel=preconnect'
  );
  headers.append(
    "Link",
    '<https://fonts.gstatic.com>; rel=preconnect; crossorigin'
  );

  // Prevent MIME-type sniffing and clickjacking
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return new Response(response.body, {
    status: response.status,
    headers,
  });
};

export const config = {
  path: "/*",
  // Only run on HTML-serving paths; skip known static asset extensions
  excludedPath: [
    "/*.css",
    "/*.js",
    "/*.png",
    "/*.jpg",
    "/*.svg",
    "/*.ico",
    "/*.woff2",
    "/*.woff",
    "/*.pdf",
  ],
};
