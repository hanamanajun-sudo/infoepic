/**
 * GET /oauth/auth
 * GitHub OAuth 시작 — 사용자를 GitHub 인증 페이지로 리디렉션
 */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  // Decap CMS가 보내는 site_id(= CMS 페이지 origin)를 state에 담아 보존
  const siteId = url.searchParams.get('site_id') || url.origin;
  const scope  = url.searchParams.get('scope')   || 'repo,user';

  const state = btoa(JSON.stringify({ siteId }));

  const params = new URLSearchParams({
    client_id:    env.GITHUB_CLIENT_ID,
    redirect_uri: `${url.origin}/oauth/callback`,
    scope,
    state,
  });

  return Response.redirect(
    `https://github.com/login/oauth/authorize?${params}`,
    302
  );
}
