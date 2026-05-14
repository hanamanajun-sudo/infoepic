/**
 * 빈 폴더에 HTML 가져오기
 * infoepic.com/[번호] → canonical 슬러그 추출 → toybako-1-1/[번호]/[번호]-[슬러그].html 저장
 *
 * 실행: node scripts/fetch-missing.mjs
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../toybako-1-1');

// 88개 빈 폴더 번호
const EMPTY_FOLDERS = [
  32, 55, 85, 91, 92, 110, 135, 152, 157, 158, 164, 170, 172, 190,
  201, 204, 205, 206, 209, 218, 223, 225, 228, 231, 232, 234, 237,
  240, 246, 248, 258, 261, 264, 267, 274, 284, 288, 301, 322, 323,
  334, 337, 341, 344, 347, 351, 356, 359, 360, 365, 368, 370, 375,
  380, 393, 404, 407, 414, 420, 421, 447, 451, 455, 457, 458, 473,
  481, 484, 487, 490, 491, 497, 501, 505, 506, 538, 546, 551, 560,
  564, 568, 579, 581, 592, 596, 604, 611, 633,
];

const results = { success: [], private: [], error: [] };

async function fetchHtml(num) {
  const url = `https://infoepic.com/${num}`;
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });

  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

  const html = await res.text();

  // 비공개/삭제 판별
  if (html.includes('비공개') && html.length < 5000) {
    return { ok: false, reason: '비공개 또는 삭제된 글' };
  }
  if (!html.includes('contents_style') && !html.includes('entry-content')) {
    return { ok: false, reason: '본문 없음 (비공개/삭제)' };
  }

  // canonical에서 슬러그 추출
  const canonicalMatch = html.match(/rel="canonical"\s+href="([^"]+)"/);
  if (!canonicalMatch) return { ok: false, reason: 'canonical 없음' };

  const canonicalUrl = canonicalMatch[1];
  const slugEncoded = canonicalUrl.split('/entry/')[1];
  if (!slugEncoded) return { ok: false, reason: 'entry 슬러그 없음' };

  let slug;
  try { slug = decodeURIComponent(slugEncoded); } catch { slug = slugEncoded; }

  return { ok: true, html, slug };
}

async function main() {
  console.log(`=== 빈 폴더 HTML 다운로드 (${EMPTY_FOLDERS.length}개) ===\n`);

  for (let i = 0; i < EMPTY_FOLDERS.length; i++) {
    const num = EMPTY_FOLDERS[i];
    process.stdout.write(`[${i + 1}/${EMPTY_FOLDERS.length}] ${num}번... `);

    try {
      const result = await fetchHtml(num);
      if (!result.ok) {
        console.log(`건너뜀 — ${result.reason}`);
        results.private.push({ num, reason: result.reason });
        continue;
      }

      const { html, slug } = result;
      const filename = `${num}-${slug}.html`;
      const outPath = path.join(BACKUP_DIR, String(num), filename);
      await fsp.writeFile(outPath, html, 'utf-8');

      console.log(`저장 → ${slug.slice(0, 45)}`);
      results.success.push({ num, slug });
    } catch (e) {
      console.log(`오류 — ${e.message}`);
      results.error.push({ num, error: e.message });
    }

    // 요청 간격 (서버 과부하 방지)
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n=== 완료 ===');
  console.log(`성공: ${results.success.length}개`);
  console.log(`비공개/삭제: ${results.private.length}개`);
  console.log(`오류: ${results.error.length}개`);

  if (results.private.length > 0) {
    console.log('\n비공개/삭제 목록:');
    results.private.forEach(({ num, reason }) => console.log(`  ${num}: ${reason}`));
  }
  if (results.error.length > 0) {
    console.log('\n오류 목록:');
    results.error.forEach(({ num, error }) => console.log(`  ${num}: ${error}`));
  }

  console.log('\n성공 목록 (슬러그):');
  results.success.forEach(({ num, slug }) => console.log(`  ${num}: ${slug}`));
}

main().catch(e => { console.error(e); process.exit(1); });
