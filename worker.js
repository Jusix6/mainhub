/**
 * Cloudflare Worker in front of the static assets.
 * The only job: send the apex domain to the canonical www host with a permanent
 * redirect. Everything else is handed straight to the static assets (dist/).
 */
const CANONICAL_HOST = 'www.jxsi.ch';
const APEX_HOST = 'jxsi.ch';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === APEX_HOST) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
