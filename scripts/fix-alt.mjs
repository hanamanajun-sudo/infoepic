/**
 * fix-alt.mjs
 * 마이그레이션된 마크다운 파일의 빈 이미지 alt 텍스트를 보강합니다.
 * 빈 alt: ![]() → ![{제목} 이미지 N]()
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.resolve(__dirname, '../src/content/blog');

const files = await fs.readdir(contentDir);
const mdFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.mdx'));

let totalFiles = 0;
let totalImages = 0;

for (const filename of mdFiles) {
  const filePath = path.join(contentDir, filename);
  let content = await fs.readFile(filePath, 'utf8');

  // title 추출
  const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
  const title = titleMatch
    ? titleMatch[1].trim()
    : path.basename(filename, path.extname(filename)).replace(/-/g, ' ');

  let imgCount = 0;
  const original = content;

  // 빈 alt: ![](...) → ![{title} 이미지 N](...)
  content = content.replace(/!\[\]\(([^)]*)\)/g, (_, src) => {
    imgCount++;
    return `![${title} 이미지 ${imgCount}](${src})`;
  });

  // 무의미한 alt: image, img, 사진, 그림, photo, screenshot 등
  content = content.replace(
    /!\[(image|img|사진|그림|이미지|photo|picture|screenshot|photo\d*|image\d*|img\d*)\]\(([^)]*)\)/gi,
    (_, _alt, src) => {
      imgCount++;
      return `![${title} 이미지 ${imgCount}](${src})`;
    }
  );

  if (content !== original) {
    await fs.writeFile(filePath, content, 'utf8');
    totalFiles++;
    totalImages += imgCount;
    console.log(`✓ ${filename} — ${imgCount}개 이미지 보강`);
  }
}

console.log(`\n완료: ${totalFiles}개 파일, 총 ${totalImages}개 이미지 alt 보강`);
