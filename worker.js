/**
 * Cloudflare Worker in front of the static assets.
 * The only job: send the apex domain and any plain-http request to the
 * canonical https://www host with a permanent redirect. Everything else is
 * handed straight to the static assets (dist/).
 */
const CANONICAL_HOST = 'www.jxsi.ch';
const APEX_HOST = 'jxsi.ch';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const wrongHost = url.hostname === APEX_HOST;
    const wrongScheme = url.protocol === 'http:' && (wrongHost || url.hostname === CANONICAL_HOST);
    if (wrongHost || wrongScheme) {
      url.hostname = CANONICAL_HOST;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
