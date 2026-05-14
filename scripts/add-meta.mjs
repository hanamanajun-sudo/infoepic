/**
 * 카테고리 + 썸네일 frontmatter 자동 추가 스크립트
 * node scripts/add-meta.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.resolve(__dirname, '../src/content/blog');

// ─── 카테고리 정의 ────────────────────────────────────────────────────────────
const CATEGORIES = [
  // 우선순위 순서 (먼저 매칭되는 것이 우선)
  {
    key: 'sns',
    label: '유튜브·SNS',
    test: s => /유튜브|인스타|카카오톡|트위터|채널|댓글|시청기록|구독|자막|재생시간|youtube|name/.test(s),
  },
  {
    key: 'ai',
    label: 'AI·신기술',
    test: s => /\bai\b|인공지능|챗gpt|chatgpt|nft|메타마스크|브랫gpt|음성.변환|텍스트.ai/.test(s),
  },
  {
    key: '신조어',
    label: '신조어·뜻',
    test: s => /뜻|의미|신조어|줄임말|초성|어원|어감|줄임|이란|란\?|차이점|차이|would|should|could|발음|hoes.mad|soty|pip뜻/.test(s),
  },
  {
    key: '생활',
    label: '생활·상식',
    test: s => /호칭|예절|장례|남편|아내|오빠|누나|동생|처제|동서|형의|누나의|형님|여동생|다이어트|노래방|레고|귤|이케아|빌보드|rc카|dji|카메라|sony|zv-1|녹음기/.test(s),
  },
  {
    key: 'it',
    label: 'IT·컴퓨터',
    test: s => /파일|프로그램|윈도우|크롬|엑셀|단축키|캡쳐|스크린샷|화상회의|블루투스|로지텍|포토샵|컴퓨터|바탕화면|폴더|아이콘|heic|jfif|avif|gif용량|otf|ttf|확장자|용량.줄|ssd|remini|필기앱|ip.확인|사파리|손전등|ebs|화질/.test(s),
  },
  {
    key: '엔터',
    label: '엔터·이슈',
    test: () => true, // fallback
  },
];

function categorize(slug, title) {
  const s = (slug + ' ' + title).toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.test(s)) return cat.key;
  }
  return '엔터';
}

function extractThumbnail(body) {
  const m = body.match(/!\[.*?\]\(([^)]+)\)/);
  return m ? m[1] : null;
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
const stats = {};

let updated = 0;
for (const file of files) {
  const filePath = path.join(BLOG_DIR, file);
  const raw = fs.readFileSync(filePath, 'utf-8');

  // frontmatter 파싱
  const fmMatch = raw.match(/^(---\n)([\s\S]*?)(---\n)([\s\S]*)$/);
  if (!fmMatch) continue;

  const [, open, fm, close, body] = fmMatch;

  // 이미 있으면 건너뜀
  const alreadyHasCat = fm.includes('\ncategory:');
  const alreadyHasThumb = fm.includes('\nthumbnail:');
  if (alreadyHasCat && alreadyHasThumb) {
    const catMatch = fm.match(/^category: (.+)$/m);
    if (catMatch) stats[catMatch[1]] = (stats[catMatch[1]] || 0) + 1;
    continue;
  }

  const titleMatch = fm.match(/^title: "([^"]+)"/m);
  const title = titleMatch ? titleMatch[1] : '';
  const slug = file.replace(/\.md$/, '');

  const category = categorize(slug, title);
  const thumbnail = extractThumbnail(body);

  let newFm = fm;
  if (!alreadyHasCat) newFm += `category: ${category}\n`;
  if (!alreadyHasThumb && thumbnail) newFm += `thumbnail: "${thumbnail}"\n`;

  fs.writeFileSync(filePath, open + newFm + close + body, 'utf-8');
  stats[category] = (stats[category] || 0) + 1;
  updated++;
}

console.log(`\n업데이트: ${updated}개`);
console.log('\n카테고리 분포:');
for (const [cat, count] of Object.entries(stats).sort((a,b) => b[1]-a[1])) {
  const label = CATEGORIES.find(c => c.key === cat)?.label ?? cat;
  console.log(`  ${label} (${cat}): ${count}개`);
}
