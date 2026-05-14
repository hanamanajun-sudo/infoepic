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
  // Decap CMS netlify-auth.js 프로토콜:
  //   1) 팝업 → opener : "authorizing:github"  (handshake 시작)
  //   2) opener → 팝업 : 동일 메시지 echo back (CMS가 authorizeCallback 등록 완료 신호)
  //   3) 팝업 → opener : "authorization:github:success:{...}" (또는 :error:{...})
  // origin 검증: opener는 e.origin === base_url 만 허용
  const finalMsg = `authorization:github:${result}:${JSON.stringify(data)}`;
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>인증 ${result === 'success' ? '완료' : '실패'}</title></head>
<body>
<pre id="log" style="font-family:monospace;font-size:13px;margin:30px auto;max-width:600px;background:#f5f5f5;padding:16px;border-radius:8px;white-space:pre-wrap;"></pre>
<script>
(function() {
  var finalMsg = ${JSON.stringify(finalMsg)};
  var handshake = 'authorizing:github';
  var log = document.getElementById('log');
  function line(t) { log.textContent += t + '\\n'; }

  line('result : ${result}');
  line('opener : ' + (window.opener ? 'OK' : 'null'));

  if (!window.opener) {
    line('window.opener 가 null 입니다. 팝업 차단 / noopener 확인 필요.');
    return;
  }

  // 1단계: handshake 메시지 송신을 주기적으로 시도 (opener 가 리스너 등록할 때까지)
  var handshakeAcked = false;
  var sendInterval = setInterval(function() {
    if (handshakeAcked) return;
    try { window.opener.postMessage(handshake, '*'); } catch (e) {}
  }, 100);

  // 2단계: opener 로부터 동일 handshake echo 수신 → 최종 메시지 송신
  function onMessage(e) {
    if (e.source !== window.opener) return;
    if (e.data !== handshake) return;
    handshakeAcked = true;
    clearInterval(sendInterval);
    window.removeEventListener('message', onMessage, false);

    line('handshake : ack received');
    try {
      // origin 이 검증되었으므로 e.origin 으로 명시 송신
      window.opener.postMessage(finalMsg, e.origin || '*');
      line('postMessage : sent → ' + (e.origin || '*'));
      line('msg : ' + finalMsg.substring(0, 80) + '...');
    } catch (err) {
      line('postMessage 오류 : ' + err);
    }
    setTimeout(function() { try { window.close(); } catch (e) {} }, 600);
  }
  window.addEventListener('message', onMessage, false);

  // 첫 handshake 즉시 송신
  try { window.opener.postMessage(handshake, '*'); } catch (e) {}
  line('handshake : sent (authorizing:github)');

  // 안전장치: 10초 안에 ack 없으면 정리
  setTimeout(function() {
    if (!handshakeAcked) {
      clearInterval(sendInterval);
      line('handshake ack 없음 (10초 타임아웃)');
    }
  }, 10000);
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
