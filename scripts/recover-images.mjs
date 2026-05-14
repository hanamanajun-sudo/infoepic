/**
 * recover-images.mjs
 * 깨진 이미지 복구:
 * 1) toybako img/ 폴더에서 이미지 복사
 * 2) 복사 안 되면 toybako HTML의 원본 CDN URL로 재다운로드
 */
import { readdir, readFile, copyFile, mkdir, writeFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

const BLOG    = process.cwd() + '/src/content/blog';
const TOYBAKO = 'C:/Users/hanam/OneDrive/바탕 화면/클로드cowork/infoepic/toybako-1-1';
const PUBLIC  = process.cwd() + '/public/images';

// ── 1) toybako slug → 폴더번호 맵 ────────────────────────────────────────────
console.log('📂 toybako 슬러그 맵 구축 중...');
const toySlugMap = new Map(); // slug → folderPath
for (const folder of await readdir(TOYBAKO)) {
  const fp = join(TOYBAKO, folder);
  if (!statSync(fp).isDirectory()) continue;
  const files = await readdir(fp);
  const html  = files.find(f => f.endsWith('.html'));
  if (!html) continue;
  const slug = html.replace(/^\d+-/, '').replace(/\.html$/, '');
  toySlugMap.set(slug, fp);
}
console.log(`  → ${toySlugMap.size}개`);

// ── 2) 깨진 이미지 참조 수집 ─────────────────────────────────────────────────
const mdFiles = (await readdir(BLOG)).filter(f => f.endsWith('.md'));
const broken  = []; // { slug, mdPath, imgRef, destPath }

for (const file of mdFiles) {
  const slug    = file.replace(/\.md$/, '');
  const mdPath  = join(BLOG, file);
  const content = await readFile(mdPath, 'utf-8');
  const matches = [...content.matchAll(/!\[.*?\]\((\/images\/([^)]+))\)/g)];
  for (const m of matches) {
    const imgRef  = m[1];                          // /images/slug/filename
    const relPath = m[2];                          // slug/filename
    const dest    = join(PUBLIC, relPath);
    if (!existsSync(dest)) {
      broken.push({ slug, mdPath, imgRef, destPath: dest, relPath });
    }
  }
}
console.log(`\n🔍 깨진 이미지 참조: ${broken.length}개`);

// ── 3) 복구 시도 ─────────────────────────────────────────────────────────────
let copied = 0, downloaded = 0, failed = [];

for (const item of broken) {
  const { slug, imgRef, destPath, relPath } = item;
  const destDir = join(PUBLIC, relPath.split('/')[0]);

  // dest 폴더 생성
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }

  // A) toybako img/ 폴더에서 찾기
  const toyFolder = toySlugMap.get(slug);
  let recovered = false;

  if (toyFolder) {
    const imgDir = join(toyFolder, 'img');
    if (existsSync(imgDir)) {
      const toyImgs = await readdir(imgDir).catch(() => []);
      // 파일명 유사 매칭
      const targetName = basename(destPath).toLowerCase();
      let match = toyImgs.find(f => f.toLowerCase() === targetName);

      if (!match) {
        // 확장자 없이 앞부분 비교
        const targetBase = targetName.replace(/\.[^.]+$/, '');
        match = toyImgs.find(f => f.toLowerCase().startsWith(targetBase.substring(0, Math.min(20, targetBase.length))));
      }

      if (!match && toyImgs.length === 1 && broken.filter(b => b.slug === slug).length === 1) {
        // 이미지 1개, 참조 1개 → 그냥 복사
        match = toyImgs[0];
      }

      if (match) {
        const src = join(imgDir, match);
        // 확장자 맞추기
        const srcExt  = extname(match);
        const destExt = extname(destPath);
        const finalDest = destExt ? destPath : destPath + srcExt;
        await copyFile(src, finalDest).catch(() => null);
        if (existsSync(finalDest)) {
          copied++;
          recovered = true;
          continue;
        }
      }
    }
  }

  // B) CDN URL 재다운로드
  if (!recovered && toyFolder) {
    const htmlFiles = (await readdir(toyFolder)).filter(f => f.endsWith('.html'));
    if (htmlFiles.length > 0) {
      const html = await readFile(join(toyFolder, htmlFiles[0]), 'utf-8');
      // 이미지 CDN URL 추출
      const cdnUrls = [...html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp|mp4)/gi)]
        .map(m => m[0]);

      for (const url of cdnUrls) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 100) continue;

          const ext      = extname(new URL(url).pathname) || '.jpg';
          const finalDest = extname(destPath) ? destPath : destPath + ext;
          await writeFile(finalDest, buf);
          downloaded++;
          recovered = true;
          break;
        } catch {}
      }
    }
  }

  if (!recovered) {
    failed.push(imgRef);
  }
}

console.log(`\n✅ toybako 복사: ${copied}개`);
console.log(`✅ CDN 재다운로드: ${downloaded}개`);
console.log(`❌ 복구 실패: ${failed.length}개`);
if (failed.length > 0 && failed.length <= 30) {
  console.log('\n복구 실패 목록:');
  failed.forEach(f => console.log(' -', f));
}
