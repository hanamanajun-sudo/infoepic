/**
 * recover-from-tistory.mjs
 * 티스토리 원본 페이지에서 이미지를 긁어와 복구
 */
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';

const BLOG   = process.cwd() + '/src/content/blog';
const PUBLIC = process.cwd() + '/public/images';

// 여전히 깨진 이미지 수집
const mdFiles = (await readdir(BLOG)).filter(f => f.endsWith('.md'));
const brokenBySlug = {};

for (const file of mdFiles) {
  const slug    = file.replace('.md', '');
  const content = await readFile(join(BLOG, file), 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^!\[.*?\]\((\/images\/.+)\)\s*$/);
    if (!m) continue;
    const ref = m[1];
    const relPath = ref.replace(/^\/images\//, '');
    const dest = join(PUBLIC, relPath);
    if (!existsSync(dest)) {
      if (!brokenBySlug[slug]) brokenBySlug[slug] = [];
      brokenBySlug[slug].push({ ref, dest, relPath });
    }
  }
}

const slugs = Object.keys(brokenBySlug);
console.log(`복구 대상: ${slugs.length}개 글`);

let totalSaved = 0, totalFailed = 0;
const failedSlugs = [];

for (const slug of slugs) {
  const items   = brokenBySlug[slug];
  const tistoryUrl = 'https://toybako.tistory.com/entry/' + encodeURIComponent(slug);

  process.stdout.write(`\n[${slug.substring(0,30)}...] 페이지 접속 중...`);

  let html = '';
  try {
    const res = await fetch(tistoryUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { process.stdout.write(` HTTP ${res.status}`); failedSlugs.push(slug); continue; }
    html = await res.text();
  } catch (e) {
    process.stdout.write(` 접속 실패: ${e.message}`);
    failedSlugs.push(slug);
    continue;
  }

  // 서명된 CDN URL 추출 (credential= 포함된 것만)
  const signedUrls = [...html.matchAll(/https:\/\/blog\.kakaocdn\.net\/dna\/[^\s"'<>]+credential=[^\s"'<>]+/gi)]
    .map(m => m[0].replace(/&amp;/g, '&'));

  // 일반 CDN URL도 폴백으로
  const plainUrls = [...html.matchAll(/https:\/\/(?:blog\.kakaocdn\.net|img\d*\.daumcdn\.net)\/[^\s"'<>]+(?:img\.(?:jpg|jpeg|png|gif|webp))/gi)]
    .map(m => m[0]);

  const contentImgs = [...new Set([...signedUrls, ...plainUrls])].filter(u =>
    !u.includes('profile') && !u.includes('favicon') && !u.includes('thumb/S')
  );

  process.stdout.write(` 이미지 ${contentImgs.length}개 발견`);

  if (contentImgs.length === 0) { failedSlugs.push(slug); continue; }

  // 순서대로 매칭 다운로드
  const destDir = join(PUBLIC, slug);
  if (!existsSync(destDir)) await mkdir(destDir, { recursive: true });

  let saved = 0;
  for (let i = 0; i < items.length; i++) {
    const item   = items[i];
    const imgUrl = contentImgs[i] || contentImgs[contentImgs.length - 1];
    if (!imgUrl) continue;

    try {
      const res = await fetch(imgUrl, {
        headers: { 'Referer': 'https://toybako.tistory.com/' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) continue;

      // 확장자 결정
      let dest = item.dest;
      if (!extname(dest)) {
        const ct  = res.headers.get('content-type') || '';
        const ext = ct.includes('png') ? '.png' : ct.includes('gif') ? '.gif' : '.jpg';
        dest += ext;
      }
      await writeFile(dest, buf);
      saved++;
      totalSaved++;
    } catch {}
  }
  process.stdout.write(` → ${saved}개 저장`);
  if (saved < items.length) failedSlugs.push(slug);
}

console.log(`\n\n✅ 총 복구: ${totalSaved}개`);
console.log(`❌ 실패 글: ${failedSlugs.length}개`);
if (failedSlugs.length) {
  console.log('\n실패 목록:');
  failedSlugs.forEach(s => console.log(' -', s));
}
