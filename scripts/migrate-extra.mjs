/**
 * 추가 글 마이그레이션 스크립트
 * 백업 슬러그를 직접 지정해서 처리
 * 실행: node scripts/migrate-extra.mjs
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseHtml } from 'node-html-parser';
import TurndownService from 'turndown';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASTRO_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(ASTRO_ROOT, '..');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'toybako-1-1');
const CONTENT_DIR = path.join(ASTRO_ROOT, 'src', 'content', 'blog');
const IMAGES_DIR = path.join(ASTRO_ROOT, 'public', 'images');
const REPORT_PATH = path.join(ASTRO_ROOT, 'migration-extra-report.md');

// ─── 추가 이전 대상 (백업 슬러그 기준) ──────────────────────────────────────
const EXTRA_BACKUP_SLUGS = [
  'heic파일을-jpeg로-바꾸는-가장-간단한-방법',
  '한글(hwp-확장자)-파일-뷰어x-무설치o-(3초-해결)',
  '컴퓨터-바탕화면-폴더-아이콘-변경하는-방법',
  '바탕화면-폴더-아이콘-변경-방법추천-디자인',
  '이미지-용량-확-줄이는-웹사이트-2곳-강력-추천-(프로그램-설치-아님)',
  '화상회의-프로그램-7종-비교추천',
  '캡쳐-프로그램-추천-_-픽픽-(PicPick)-완벽한-기능-무료-툴',
  '무료-스크린샷-저장-&-편집-프로그램-추천',
  '무료-포토샵-대체-사이트-(웹-프로그램-추천)---2022',
  '이미지-파일-속-글자를-텍스트로-변환-사이트-3초-간단-방법',
  'jfif-파일-jpg로-변환-하기(2가지-방법-추천)-프로그램X',
  '엑셀-전체-링크-삭제-(-2007)---하이퍼링크-간단--해제-방법',
  '유튜브-댓글-삭제-방법--3초-해결-(+내가-쓴-댓글-모두-확인)',
  '유튜브-시청기록-확인_삭제-방법-(데스크탑,-핸드폰)',
  '유튜브-시청_검색-기록-삭제-방법(3초-해결)',
  '유튜브-최근-동영상-지우는-3가지-방법(시청,-검색-기록)',
  '유튜브-새-채널-5초-만에-만드는-방법-총정리',
  '크롬-읽기목록-제거-방법-(상단바에서-지우기)',
  '인스타-추천게시물-안뜨게-설정-(간단-팁)',
  '카카오톡-폰트-변경-방법-추천-폰트-가독성-미친-귀여운-글씨체',
  'NFT란-뜻',
  'NFT만드는-방법-(가입,-작품-발행,-판매)-3분-완성',
  '메타마스크-지갑-설치-다운로드-방법---NFT-가입-단계1)',
  'AI-동영상-제작-프로그램-비교-(텍스트로-자동으로-영상-만들어주는-AI)',
  '무료-텍스트-AI-음성-변환_생성-사이트-BEST-2-추천',
  '챗gpt로-영어공부하는-방법-(몇가지-문장-기억으로-무료-사용)',
  '장례식-예절-정리(복장,-절-하는법,-절차)맞아요',
  'NVMe-SSD-종류별-성능--속도-차이점',
  'would-should-could-차이점-뭐야-어감과-구분법',
  'R-발음과-L발음-차이-(꿀팁)---이거-알면-고민-해결',
  // 트래픽 4개
  '저작권-걱정없는-무료-폰트-안심글꼴(140종)',
  '트위터-동영상-다운로드-사이트-(3초-초간단-저장)',
  '여동생의-남편-호칭-(오빠나-언니가-동생-남편-부르는-호칭)',
  '유튜브-가장-많이-본-장면-안-뜨는-이유-완벽-정리-(설정-기준과-해결법)',
  // 추가 3개
  '빌보드-핫100_200-차이점-(BTS-1위-빌보드-기준-간단-정리)',
  '유튜브[시간-이동_속도]단축키-모음(프레임-이동)',
  '다이어트-재밌게-하는-방법',
];

// ─── 백업 인덱스 ──────────────────────────────────────────────────────────────
function buildFileIndex() {
  const index = new Map();
  for (const folder of fs.readdirSync(BACKUP_DIR)) {
    const fp = path.join(BACKUP_DIR, folder);
    if (!fs.statSync(fp).isDirectory()) continue;
    for (const file of fs.readdirSync(fp).filter(f => f.endsWith('.html'))) {
      const slug = file.replace(/^\d+-/, '').replace(/\.html$/, '');
      index.set(slug, { htmlPath: path.join(fp, file), imgDir: path.join(fp, 'img'), folder });
    }
  }
  return index;
}

// ─── 공통 파이프라인 (migrate.mjs와 동일) ─────────────────────────────────────
const ADSENSE_PATTERNS = [/adsbygoogle/i, /googlesyndication/i, /pagead2/i, /ca-pub-/i];

function parsePostHtml(html) {
  const root = parseHtml(html, { lowerCaseTagName: false });
  let title = root.querySelector('h2.title-article')?.text.trim() ?? '';
  if (!title) {
    const m = html.match(/property="og:title"\s+content="([^"]+)"/);
    title = m ? m[1] : '';
  }
  if (!title) {
    const m = html.match(/content="([^"]+)"\s+property="og:title"/);
    title = m ? m[1] : '';
  }
  let dateStr = root.querySelector('p.date')?.text.trim() ?? '';
  if (!dateStr) {
    const spanDate = root.querySelector('span.date')?.text.trim() ?? '';
    if (spanDate) dateStr = spanDate.replace(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/, '$1-$2-$3').trim();
  }
  return { title, dateStr, contentEl: root.querySelector('div.contents_style') };
}

function cleanContent(contentEl) {
  if (!contentEl) return;
  for (const s of contentEl.querySelectorAll('script')) if (ADSENSE_PATTERNS.some(p=>p.test(s.innerHTML))) s.remove();
  for (const el of contentEl.querySelectorAll('ins.adsbygoogle,noscript,style,link')) el.remove();
  for (const h1 of contentEl.querySelectorAll('h1')) {
    const h2 = parseHtml(`<h2>${h1.innerHTML}</h2>`).querySelector('h2');
    h1.replaceWith(h2);
  }
  for (const a of contentEl.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') ?? '';
    if (href.includes('toybako.tistory.com'))
      a.setAttribute('href', href.replace(/https?:\/\/toybako\.tistory\.com/, 'https://infoepic.com'));
  }
}

function isTrackingPixel(img) {
  return parseInt(img.getAttribute('width') ?? '9999') <= 1 || parseInt(img.getAttribute('height') ?? '9999') <= 1;
}

function guessExt(url) {
  const m = url.split('?')[0].match(/\.(jpe?g|png|gif|webp|svg|bmp)$/i);
  return m ? m[0].toLowerCase() : '.jpg';
}

async function downloadImage(url, dest) {
  if (url.startsWith('//')) url = 'https:' + url;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100) throw new Error('too small');
    await fsp.writeFile(dest, Buffer.from(buf));
    return true;
  } catch (e) { return { error: e.message }; }
}

async function processImages(contentEl, slug, imgDir, report) {
  const destDir = path.join(IMAGES_DIR, slug);
  await fsp.mkdir(destDir, { recursive: true });
  let extCount = 0;

  for (const img of contentEl.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? '';
    if (!src || src.startsWith('data:')) continue;
    if (isTrackingPixel(img)) { img.remove(); continue; }

    if (src.startsWith('http') || src.startsWith('//')) {
      extCount++;
      const filename = `img-${extCount}${guessExt(src)}`;
      const result = await downloadImage(src, path.join(destDir, filename));
      if (result === true) img.setAttribute('src', `/images/${slug}/${filename}`);
      else { report.imageFailures.push({ slug, url: src, error: result.error }); img.remove(); }
    } else if (imgDir) {
      const localName = src.replace(/^\.\/img\//, '').replace(/^img\//, '');
      const srcPath = path.join(imgDir, localName);
      if (fs.existsSync(srcPath)) {
        await fsp.copyFile(srcPath, path.join(destDir, localName));
        img.setAttribute('src', `/images/${slug}/${localName}`);
      } else { report.imageFailures.push({ slug, url: src, error: 'local not found' }); img.remove(); }
    } else { img.remove(); }
  }
  for (const el of contentEl.querySelectorAll('[style*="daumcdn"]')) el.removeAttribute('style');
}

function makeMarkdown(contentEl) {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  td.addRule('figure', { filter: 'figure', replacement: (_c, node) => {
    const img = node.querySelector('img');
    if (!img) return '';
    return `\n\n![${img.getAttribute('alt')??''}](${img.getAttribute('src')??''})\n\n`;
  }});
  td.addRule('emptyP', { filter: n => n.nodeName==='P' && n.textContent.trim()==='', replacement: ()=>'' });
  td.addRule('span', { filter: 'span', replacement: c => c });
  td.remove(['script','style','ins','noscript','iframe']);
  return td.turndown(contentEl.innerHTML);
}

function extractDescription(contentEl) {
  for (const p of contentEl.querySelectorAll('p')) {
    const t = p.text.replace(/\s+/g,' ').trim();
    if (t.length > 20) return t.length > 160 ? t.slice(0,157)+'...' : t;
  }
  const t = contentEl.text.replace(/\s+/g,' ').trim();
  return t.length > 160 ? t.slice(0,157)+'...' : t;
}

function buildFrontmatter(title, slug, dateStr, description) {
  const esc = s => s.replace(/"/g,'\\"');
  let pubDate = '';
  if (dateStr) { const d = new Date(dateStr.replace(' ','T')); if (!isNaN(d)) pubDate = d.toISOString().slice(0,10); }
  return `---\ntitle: "${esc(title)}"\ndescription: "${esc(description??'')}"\npubDate: ${pubDate||'2020-01-01'}\nslug: "${slug}"\n---`;
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`=== 추가 이전 (${EXTRA_BACKUP_SLUGS.length}개) ===\n`);
  const report = { processed: [], skipped: [], imageFailures: [] };

  await fsp.mkdir(CONTENT_DIR, { recursive: true });
  await fsp.mkdir(IMAGES_DIR, { recursive: true });

  const fileIndex = buildFileIndex();

  // 이미 이전된 파일 목록
  const alreadyDone = new Set(fs.readdirSync(CONTENT_DIR).filter(f=>f.endsWith('.md')).map(f=>f.replace(/\.md$/,'')));

  let count = 0;
  for (const backupSlug of EXTRA_BACKUP_SLUGS) {
    count++;

    if (alreadyDone.has(backupSlug)) {
      console.log(`[${count}/${EXTRA_BACKUP_SLUGS.length}] 이미 존재 — ${backupSlug.slice(0,50)}`);
      report.skipped.push({ slug: backupSlug, reason: '이미 이전됨' });
      continue;
    }

    const info = fileIndex.get(backupSlug);
    if (!info) {
      console.log(`[${count}/${EXTRA_BACKUP_SLUGS.length}] 백업 없음 — ${backupSlug.slice(0,50)}`);
      report.skipped.push({ slug: backupSlug, reason: '백업 파일 없음' });
      continue;
    }

    process.stdout.write(`[${count}/${EXTRA_BACKUP_SLUGS.length}] ${backupSlug.slice(0,55)}... `);
    try {
      const html = fs.readFileSync(info.htmlPath, 'utf-8');
      const { title, dateStr, contentEl } = parsePostHtml(html);
      if (!contentEl) throw new Error('contents_style 없음');

      cleanContent(contentEl);
      await processImages(contentEl, backupSlug, info.imgDir, report);
      const desc = extractDescription(contentEl);
      const md = makeMarkdown(contentEl);
      const fm = buildFrontmatter(title, backupSlug, dateStr, desc);
      await fsp.writeFile(path.join(CONTENT_DIR, `${backupSlug}.md`), `${fm}\n\n${md.trim()}\n`, 'utf-8');
      console.log('✅');
      report.processed.push(backupSlug);
    } catch (e) {
      console.log(`❌ ${e.message}`);
      report.skipped.push({ slug: backupSlug, reason: e.message });
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`성공: ${report.processed.length}개`);
  console.log(`건너뜀/실패: ${report.skipped.length}개`);
  console.log(`이미지 실패: ${report.imageFailures.length}개`);

  const lines = ['# 추가 이전 보고서', `> ${new Date().toLocaleString('ko-KR')}`, '',
    `성공: ${report.processed.length} | 건너뜀: ${report.skipped.length} | 이미지실패: ${report.imageFailures.length}`, '',
    '## 성공', ...report.processed.map(s=>`- ${s}`), '',
    '## 건너뜀/실패', ...report.skipped.map(({slug,reason})=>`- \`${slug}\`: ${reason}`),
  ];
  await fsp.writeFile(REPORT_PATH, lines.join('\n'), 'utf-8');
}

main().catch(e => { console.error(e); process.exit(1); });
