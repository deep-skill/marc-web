const CANONICAL_HOST = 'marc.com.pe';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === `www.${CANONICAL_HOST}`) {
    url.hostname = CANONICAL_HOST;
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
