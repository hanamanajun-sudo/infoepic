/**
 * content-tasks.mjs
 * 1) 13개 이미지전용 글 → draft: true
 * 2) toybako-1-1 HTML에서 실제 발행일 추출 → pubDate 업데이트
 * 3) 어필리에이트(파트너스) 문구/링크 제거 (눈오리 제외, 사용자가 직접 삭제)
 * 4) 깨진 이미지 참조 확인
 * 5) 콘텐츠 감사 보고서 생성
 */
import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

import { resolve } from 'path';
const BASE    = resolve(process.cwd());
const BLOG    = resolve(BASE, 'src/content/blog');
const TOYBAKO = 'C:\\Users\\hanam\\OneDrive\\바탕 화면\\클로드cowork\\infoepic\\toybako-1-1';
const PUBLIC_IMAGES = resolve(BASE, 'public/images');
const REPORT_PATH   = resolve(BASE, 'content-audit.md');

// ── 1) 이미지전용 글 비공개 처리 ────────────────────────────────────────────
const DRAFT_SLUGS = [
  '남자들이-보면-흥분하는-움짤',
  '옛날-노예-VS-요즘-노예',
  '고추가-고소해진-사연-페트병에-고추낀-남동생-이야기',
  '합격-추천짤-쇼미더머니-합격-목거리',
  '평화로운-당근마켓-레전드-모음',
  '맨날-싸워-짤-아빠어디가-짤',
  '남자남편들-비상금-숨기는-장소-모음',
  '주호민-각성-모드-영화-출연',
  '치와와-장점성격-분노움짤',
  '내-이럴줄-알았다범죄와의전쟁빡침-화남-짤-모음',
  '컴퓨터-고장-났을-때-짤-움짤-컴맹-컴퓨터-파괴',
  '야구-볼-때-필요한-짤-런닝맨-야구짤로-야구시즌-준비하세요',
  '작명-노하우-밴드이름-랩네임-회사-브랜드-이름-추천-1',
];

// ── 3) 어필리에이트 제거 대상 ────────────────────────────────────────────────
const AFFILIATE_SLUGS = [
  'AI-노래-커버-프로그램-무료-사이트-5분-만에-만들기',
  '무료-텍스트-AI-음성-변환_생성-사이트-BEST-2-추천',
  '필모라-Filmora-장점-3가지-단점-2가지선택한-이유',
];

// ── 유틸: 프론트매터 필드 교체 ────────────────────────────────────────────────
function setFrontmatterField(content, field, value) {
  const re = new RegExp(`^(${field}:\\s*).*$`, 'm');
  if (re.test(content)) {
    return content.replace(re, `$1${value}`);
  }
  // 필드가 없으면 --- 바로 뒤에 삽입
  return content.replace(/^---\n/, `---\n${field}: ${value}\n`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const files = (await readdir(BLOG)).filter(f => f.endsWith('.md'));

let draftDone = 0, dateDone = 0, dateSkipped = 0, affiliateDone = 0;

// toybako-1-1에서 날짜 맵 빌드
console.log('\n📅 toybako-1-1 날짜 추출 중...');
const dateMap = new Map(); // slug → 'YYYY-MM-DD'
const folders = await readdir(TOYBAKO);
for (const folder of folders) {
  const fp = join(TOYBAKO, folder);
  const s  = await stat(fp).catch(() => null);
  if (!s?.isDirectory()) continue;

  const dirFiles = await readdir(fp);
  const html = dirFiles.find(f => f.endsWith('.html'));
  if (!html) continue;

  const raw  = await readFile(join(fp, html), 'utf-8').catch(() => '');
  // 여러 날짜 패턴 시도
  const dm   = raw.match(/<p class="date">(\d{4}-\d{2}-\d{2})/)
            || raw.match(/published_time[^>]*content="(\d{4}-\d{2}-\d{2})/)
            || raw.match(/datePublished[^>]*"(\d{4}-\d{2}-\d{2})/)
            || raw.match(/"(\d{4}-\d{2}-\d{2})T/);
  if (!dm) continue;

  // 슬러그: 앞의 숫자- 제거
  const slug = html.replace(/^\d+-/, '').replace(/\.html$/, '');
  dateMap.set(slug, dm[1]);
}
console.log(`  → ${dateMap.size}개 날짜 추출 완료`);

// 글별 처리
const brokenImages = [];      // { slug, missing: [] }
const imageOnlyBroken = [];   // 어필리에이트 글 중 이미지 경로만 있고 파일 없는 경우

for (const file of files) {
  const slug    = file.replace(/\.md$/, '');
  const fp      = join(BLOG, file);
  let   content = await readFile(fp, 'utf-8');

  // 1) 비공개 처리
  if (DRAFT_SLUGS.includes(slug)) {
    content  = setFrontmatterField(content, 'draft', 'true');
    draftDone++;
  }

  // 2) pubDate 업데이트
  if (dateMap.has(slug)) {
    const iso = `${dateMap.get(slug)}T00:00:00.000Z`;
    content = setFrontmatterField(content, 'pubDate', iso);
    dateDone++;
  } else {
    dateSkipped++;
  }

  // 3) 어필리에이트 제거
  if (AFFILIATE_SLUGS.includes(slug)) {
    // 쿠팡 링크: coupa.ng 포함 라인
    content = content.replace(/^.*coupa\.ng.*$\n?/gm, '');
    // 파트너스 면책 문구 (blockquote 라인 전체)
    content = content.replace(/^> \*\*[\s\S]*?파트너스[\s\S]*?\*\*\s*$\n?/gm, '');
    // 빈 blockquote 정리
    content = content.replace(/^>\s*\n/gm, '');
    affiliateDone++;
  }

  await writeFile(fp, content, 'utf-8');

  // 4) 깨진 이미지 확인 (모든 글)
  const imgRefs = [...content.matchAll(/!\[.*?\]\((\/images\/[^)]+)\)/g)];
  const missing = [];
  for (const m of imgRefs) {
    const relPath = m[1].replace(/^\/images\//, '');
    const absPath = join(PUBLIC_IMAGES, relPath);
    if (!existsSync(absPath)) missing.push(m[1]);
  }
  if (missing.length > 0) {
    brokenImages.push({ slug, missing });
  }
}

console.log(`\n✅ draft 처리: ${draftDone}개`);
console.log(`✅ pubDate 업데이트: ${dateDone}개 / 미매칭: ${dateSkipped}개`);
console.log(`✅ 어필리에이트 제거: ${affiliateDone}개`);
console.log(`⚠️  깨진 이미지 참조: ${brokenImages.length}개 글`);

// ── 5) 콘텐츠 감사 보고서 ─────────────────────────────────────────────────────
console.log('\n📊 콘텐츠 감사 보고서 생성 중...');

// 글자수 재계산 (수정 후)
const rows = [];
for (const file of files) {
  const slug    = file.replace(/\.md$/, '');
  const content = await readFile(join(BLOG, file), 'utf-8');
  const body    = content.replace(/^---[\s\S]*?---\s*/m, '');
  const text    = body
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/[#*>`\-|]/g, '')
    .replace(/\s+/g, ' ').trim();
  const len = text.length;
  const isAffiliate = ['눈오리-집게-광기의-후기-짤움짤-쓸데-없이-갖고-싶은-것', ...AFFILIATE_SLUGS].includes(slug);
  const isDraft = DRAFT_SLUGS.includes(slug);
  rows.push({ slug, len, isAffiliate, isDraft });
}

const under300 = rows.filter(r => r.len < 300 && !r.isDraft).sort((a, b) => a.len - b.len);
const r300_500 = rows.filter(r => r.len >= 300 && r.len < 500).sort((a, b) => a.len - b.len);
const affiliateList = rows.filter(r => r.isAffiliate);

let report = `# 콘텐츠 감사 보고서\n\n생성일: ${new Date().toLocaleDateString('ko-KR')}\n\n`;

report += `## ✏️ 300자 미만 글 (${under300.length}개) — 보강 또는 비공개 검토\n\n`;
report += `| 슬러그 | 글자수 | 조치 |\n|---|---|---|\n`;
for (const r of under300) {
  report += `| [${r.slug}](/entry/${r.slug}) | ${r.len}자 | |\n`;
}

report += `\n## ✏️ 300~500자 글 (${r300_500.length}개) — 보강 권장\n\n`;
report += `| 슬러그 | 글자수 | 조치 |\n|---|---|---|\n`;
for (const r of r300_500) {
  report += `| [${r.slug}](/entry/${r.slug}) | ${r.len}자 | |\n`;
}

report += `\n## 💰 광고·어필리에이트 있던 글 (${affiliateList.length}개)\n\n`;
report += `| 슬러그 | 비고 |\n|---|---|\n`;
for (const r of affiliateList) {
  const note = r.slug.includes('눈오리') ? '사용자 직접 삭제 예정' : '어필리에이트 문구 제거 완료 — 나중에 재설정';
  report += `| ${r.slug} | ${note} |\n`;
}

report += `\n## 🖼️ 이미지 없음(비공개 처리됨) 글 (${DRAFT_SLUGS.length}개)\n\n`;
for (const s of DRAFT_SLUGS) {
  report += `- ${s}\n`;
}

report += `\n## ❌ 깨진 이미지 참조 (${brokenImages.length}개 글)\n\n`;
for (const b of brokenImages.slice(0, 50)) {
  report += `### ${b.slug}\n`;
  for (const m of b.missing) report += `- \`${m}\`\n`;
}

await writeFile(REPORT_PATH, report, 'utf-8');

console.log('\n✅ content-audit.md 생성 완료');
console.log('\n작업 완료!');
