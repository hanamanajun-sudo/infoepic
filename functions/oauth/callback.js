/**
 * GET /oauth/callback
 * GitHub OAuth 콜백 — code를 token으로 교환 후 Decap CMS에 postMessage
 */
export async function onRequestGet({ request, env }) {
  const url   = new URL(request.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // state에서 siteId 복원
  let siteId = url.origin;
  try {
    const parsed = JSON.parse(atob(state || ''));
    if (parsed.siteId) siteId = parsed.siteId;
  } catch {}

  if (error || !code) {
    return htmlResponse(makeMessage('error', { message: error || 'Missing code' }, siteId));
  }

  // code → access_token 교환
  let tokenData;
  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
      body: JSON.stringify({
        client_id:     env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    tokenData = await res.json();
  } catch (e) {
    return htmlResponse(makeMessage('error', { message: String(e) }, siteId));
  }

  if (!tokenData.access_token) {
    return htmlResponse(
      makeMessage('error', { message: tokenData.error_description || 'Token exchange failed' }, siteId)
    );
  }

  return htmlResponse(
    makeMessage('success', { token: tokenData.access_token, provider: 'github' }, siteId)
  );
}

function makeMessage(result, data, targetOrigin) {
  const msg = `authorization:github:${result}:${JSON.stringify(data)}`;
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>인증 ${result === 'success' ? '완료' : '실패'}</title></head>
<body>
<p style="font-family:sans-serif;text-align:center;margin-top:40px">
  ${result === 'success' ? '✅ 인증 완료. 창을 닫아주세요.' : '❌ 인증 실패: ' + JSON.stringify(data)}
</p>
<script>
(function() {
  var msg    = ${JSON.stringify(msg)};
  var target = ${JSON.stringify(targetOrigin)};
  if (window.opener) {
    window.opener.postMessage(msg, target);
  }
  window.close();
})();
<\/script>
</body>
</html>`;
}

function htmlResponse(html) {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
