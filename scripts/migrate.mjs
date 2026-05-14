/**
 * infoepic.com 마이그레이션 스크립트 v2
 * 데이터 소스: infoepic페이지.csv + toybakotistory페이지.csv (실제 GSC 데이터)
 * 대상: 클릭 1+ 또는 노출 100+ (클릭0) 글
 *
 * 실행: node scripts/migrate.mjs
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
const INFOEPIC_CSV = path.join(PROJECT_ROOT, 'infoepic페이지.csv');
const TOYBAKO_CSV = path.join(PROJECT_ROOT, 'toybakotistory페이지.csv');
const CONTENT_DIR = path.join(ASTRO_ROOT, 'src', 'content', 'blog');
const IMAGES_DIR = path.join(ASTRO_ROOT, 'public', 'images');
const REPORT_PATH = path.join(ASTRO_ROOT, 'migration-report.md');

// ─── 1. GSC CSV에서 대상 슬러그 로드 ─────────────────────────────────────────

function extractSlug(url) {
  const m = url.match(/\/entry\/(.+?)(\?.*)?$/);
  return m ? decodeURIComponent(m[1]).trim() : null;
}

function loadGscTargets() {
  const slugStats = new Map();

  for (const csvPath of [INFOEPIC_CSV, TOYBAKO_CSV]) {
    const text = fs.readFileSync(csvPath, 'utf-8');
    const lines = text.split('\n').filter(l => l.trim());
    for (const line of lines.slice(1)) {
      const cols = line.split(',');
      const url = cols[0]?.trim();
      const clicks = parseInt(cols[1]) || 0;
      const impressions = parseInt(cols[2]) || 0;
      if (!url || !url.includes('/entry/')) continue;
      const slug = extractSlug(url);
      if (!slug) continue;
      const ex = slugStats.get(slug) || { clicks: 0, impressions: 0 };
      slugStats.set(slug, {
        clicks: Math.max(ex.clicks, clicks),
        impressions: Math.max(ex.impressions, impressions),
      });
    }
  }

  // 필터: 클릭 1+ 또는 노출 100+
  const targets = new Map();
  for (const [slug, stats] of slugStats) {
    if (stats.clicks >= 1 || stats.impressions >= 100) {
      targets.set(slug, stats);
    }
  }
  return targets;
}

// ─── 2. 파일 인덱스 구축 ────────────────────────────────────────────────────

function buildFileIndex() {
  const index = new Map(); // backupSlug → { htmlPath, imgDir, folderNum }
  const folders = fs.readdirSync(BACKUP_DIR);

  for (const folder of folders) {
    const folderPath = path.join(BACKUP_DIR, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.html'));
    for (const file of files) {
      const withoutExt = file.slice(0, -5);
      const prefix = folder + '-';
      const slug = withoutExt.startsWith(prefix) ? withoutExt.slice(prefix.length) : withoutExt;
      index.set(slug, {
        htmlPath: path.join(folderPath, file),
        imgDir: path.join(folderPath, 'img'),
        folderNum: folder,
      });
    }
  }
  return index;
}

// ─── 3. 퍼지 슬러그 매칭 ────────────────────────────────────────────────────

function tokenize(slug) {
  return slug.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').split('-').filter(t => t.length > 0);
}

function fuzzyScore(gsc, backup) {
  const ta = tokenize(gsc);
  const tb = tokenize(backup);
  const setA = new Set(ta);
  const setB = new Set(tb);
  let common = 0;
  for (const t of setA) if (setB.has(t)) common++;
  const score = common / Math.max(ta.length, tb.length);
  const px = Math.min(12, Math.min(gsc.length, backup.length));
  return gsc.slice(0, px) === backup.slice(0, px) ? score + 0.3 : score;
}

function findBackupMatch(gscSlug, fileIndex) {
  // 정확 매칭
  if (fileIndex.has(gscSlug)) {
    return { backupSlug: gscSlug, score: 1, matchType: 'exact', ...fileIndex.get(gscSlug) };
  }
  // 퍼지 매칭
  let bestScore = 0;
  let bestSlug = null;
  for (const backupSlug of fileIndex.keys()) {
    const s = fuzzyScore(gscSlug, backupSlug);
    if (s > bestScore) { bestScore = s; bestSlug = backupSlug; }
  }
  if (bestScore >= 0.75 && bestSlug) {
    return { backupSlug: bestSlug, score: bestScore, matchType: 'fuzzy', ...fileIndex.get(bestSlug) };
  }
  return null;
}

// ─── 4. HTML 파싱 ───────────────────────────────────────────────────────────

function parsePostHtml(htmlContent) {
  const root = parseHtml(htmlContent, { lowerCaseTagName: false });

  // 제목: 백업 형식(h2.title-article) → live 형식(og:title)
  let title = root.querySelector('h2.title-article')?.text.trim() ?? '';
  if (!title) {
    const m = htmlContent.match(/property="og:title"\s+content="([^"]+)"/);
    title = m ? m[1] : '';
  }
  if (!title) {
    const m = htmlContent.match(/content="([^"]+)"\s+property="og:title"/);
    title = m ? m[1] : '';
  }

  // 날짜
  let dateStr = root.querySelector('p.date')?.text.trim() ?? '';
  if (!dateStr) {
    const spanDate = root.querySelector('span.date')?.text.trim() ?? '';
    if (spanDate) {
      dateStr = spanDate.replace(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/, '$1-$2-$3').trim();
    }
  }

  // 본문: div.contents_style (백업/라이브 공통)
  const contentEl = root.querySelector('div.contents_style');

  return { title, dateStr, contentEl };
}

// ─── 5. 콘텐츠 정제 ─────────────────────────────────────────────────────────

const ADSENSE_PATTERNS = [/adsbygoogle/i, /googlesyndication/i, /pagead2/i, /ca-pub-/i];

function cleanContent(contentEl) {
  if (!contentEl) return;

  for (const script of contentEl.querySelectorAll('script')) {
    if (ADSENSE_PATTERNS.some(p => p.test(script.innerHTML))) script.remove();
  }
  for (const el of contentEl.querySelectorAll('ins.adsbygoogle')) el.remove();
  for (const el of contentEl.querySelectorAll('noscript, style, link')) el.remove();

  // H1 → H2
  for (const h1 of contentEl.querySelectorAll('h1')) {
    const h2 = parseHtml(`<h2>${h1.innerHTML}</h2>`).querySelector('h2');
    h1.replaceWith(h2);
  }

  // 내부 링크 치환
  for (const a of contentEl.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') ?? '';
    if (href.includes('toybako.tistory.com')) {
      a.setAttribute('href', href
        .replace('https://toybako.tistory.com', 'https://infoepic.com')
        .replace('http://toybako.tistory.com', 'https://infoepic.com'));
    }
  }
}

// ─── 6. 이미지 처리 ─────────────────────────────────────────────────────────

function isTrackingPixel(img) {
  const w = parseInt(img.getAttribute('width') ?? '9999', 10);
  const h = parseInt(img.getAttribute('height') ?? '9999', 10);
  return w <= 1 || h <= 1;
}

function isExternalUrl(src) {
  return src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//');
}

function guessExt(url) {
  const u = url.split('?')[0];
  const m = u.match(/\.(jpe?g|png|gif|webp|svg|bmp)$/i);
  return m ? m[0].toLowerCase() : '.jpg';
}

async function downloadImage(url, destPath) {
  if (url.startsWith('//')) url = 'https:' + url;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100) throw new Error('too small');
    await fsp.writeFile(destPath, Buffer.from(buf));
    return true;
  } catch (e) {
    return { error: e.message };
  }
}

async function processImages(contentEl, slug, imgDir, report) {
  const destDir = path.join(IMAGES_DIR, slug);
  await fsp.mkdir(destDir, { recursive: true });
  let extCount = 0;

  for (const img of contentEl.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? '';
    if (!src || src.startsWith('data:')) continue;
    if (isTrackingPixel(img)) { img.remove(); continue; }

    if (isExternalUrl(src)) {
      extCount++;
      const ext = guessExt(src);
      const filename = `img-${extCount}${ext}`;
      const destPath = path.join(destDir, filename);
      const result = await downloadImage(src, destPath);
      if (result === true) {
        img.setAttribute('src', `/images/${slug}/${filename}`);
      } else {
        report.imageFailures.push({ slug, url: src, error: result.error });
        report.externalImagesRemaining.push({ slug, url: src });
      }
    } else if (imgDir) {
      const localName = src.replace(/^\.\/img\//, '').replace(/^img\//, '');
      const srcPath = path.join(imgDir, localName);
      const destPath = path.join(destDir, localName);
      try {
        if (fs.existsSync(srcPath)) {
          await fsp.copyFile(srcPath, destPath);
          img.setAttribute('src', `/images/${slug}/${localName}`);
        } else {
          report.imageFailures.push({ slug, url: src, error: 'local file not found' });
          img.remove(); // broken reference 제거 (Astro 빌드 오류 방지)
        }
      } catch (e) {
        report.imageFailures.push({ slug, url: src, error: e.message });
        img.remove();
      }
    }
  }

  for (const el of contentEl.querySelectorAll('[style*="daumcdn"]')) {
    el.removeAttribute('style');
  }
}

// ─── 7. HTML → Markdown ─────────────────────────────────────────────────────

function makeMarkdown(contentEl) {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    strongDelimiter: '**',
    emDelimiter: '_',
    hr: '---',
  });

  td.addRule('figure', {
    filter: 'figure',
    replacement: (_c, node) => {
      const img = node.querySelector('img');
      if (!img) return '';
      const src = img.getAttribute('src') ?? '';
      const alt = img.getAttribute('alt') ?? (node.querySelector('figcaption')?.textContent.trim() ?? '');
      return `\n\n![${alt}](${src})\n\n`;
    },
  });

  td.addRule('emptyP', {
    filter: node => node.nodeName === 'P' && node.textContent.trim() === '',
    replacement: () => '',
  });

  td.addRule('span', { filter: 'span', replacement: c => c });
  td.remove(['script', 'style', 'ins', 'noscript', 'iframe']);

  return td.turndown(contentEl.innerHTML);
}

// ─── 8. 유틸 ────────────────────────────────────────────────────────────────

function extractDescription(contentEl) {
  for (const p of contentEl.querySelectorAll('p')) {
    const t = p.text.replace(/\s+/g, ' ').trim();
    if (t.length > 20) return t.length > 160 ? t.slice(0, 157) + '...' : t;
  }
  const t = contentEl.text.replace(/\s+/g, ' ').trim();
  return t.length > 160 ? t.slice(0, 157) + '...' : t;
}

function buildFrontmatter(title, slug, dateStr, description) {
  const esc = s => s.replace(/"/g, '\\"');
  let pubDate = '';
  if (dateStr) {
    const d = new Date(dateStr.replace(' ', 'T'));
    if (!isNaN(d.getTime())) pubDate = d.toISOString().slice(0, 10);
  }
  return `---
title: "${esc(title)}"
description: "${esc(description ?? '')}"
pubDate: ${pubDate || '2020-01-01'}
slug: "${slug}"
---`;
}

function checkAdsense(md, slug, report) {
  if (ADSENSE_PATTERNS.some(p => p.test(md))) report.adsenseRemaining.push(slug);
}

function checkBrokenLinks(md, slug, targetSlugSet, report) {
  const re = /https:\/\/infoepic\.com\/entry\/([^\s\)"']+)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const linked = decodeURIComponent(m[1]).split('?')[0];
    if (!targetSlugSet.has(linked)) report.brokenLinks.push({ from: slug, to: linked });
  }
}

// ─── 메인 ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== infoepic 마이그레이션 v2 시작 ===\n');

  const report = {
    processed: [],
    skipped: [],
    imageFailures: [],
    externalImagesRemaining: [],
    adsenseRemaining: [],
    brokenLinks: [],
  };

  await fsp.mkdir(CONTENT_DIR, { recursive: true });
  await fsp.mkdir(IMAGES_DIR, { recursive: true });

  // 기존 .md 파일 정리
  const existing = (await fsp.readdir(CONTENT_DIR)).filter(f => f.endsWith('.md'));
  for (const f of existing) await fsp.unlink(path.join(CONTENT_DIR, f));
  console.log(`[0] 기존 .md ${existing.length}개 삭제\n`);

  console.log('[1] GSC CSV에서 대상 슬러그 로드...');
  const targets = loadGscTargets();
  console.log(`    대상: ${targets.size}개 (클릭1+ 또는 노출100+)\n`);

  console.log('[2] 백업 파일 인덱스 구축...');
  const fileIndex = buildFileIndex();
  console.log(`    백업 HTML: ${fileIndex.size}개\n`);

  // 매칭 사전 계산
  console.log('[3] 슬러그 매칭...');
  const matchMap = new Map(); // gscSlug → { htmlPath, imgDir, matchType, score }
  let exactCount = 0, fuzzyCount = 0, noMatch = 0;

  for (const [gscSlug] of targets) {
    const match = findBackupMatch(gscSlug, fileIndex);
    if (match) {
      matchMap.set(gscSlug, match);
      if (match.matchType === 'exact') exactCount++;
      else fuzzyCount++;
    } else {
      noMatch++;
    }
  }
  console.log(`    정확: ${exactCount}개 | 퍼지: ${fuzzyCount}개 | 미매칭: ${noMatch}개\n`);

  const targetSlugSet = new Set(targets.keys());

  // ── 처리 함수 ──────────────────────────────────────────────────────────────
  async function processPost(gscSlug, htmlContent, imgDir, matchType) {
    const { title, dateStr, contentEl } = parsePostHtml(htmlContent);
    if (!contentEl) throw new Error('contents_style 없음');

    cleanContent(contentEl);
    await processImages(contentEl, gscSlug, imgDir, report);

    const description = extractDescription(contentEl);
    const md = makeMarkdown(contentEl);

    checkAdsense(md, gscSlug, report);
    checkBrokenLinks(md, gscSlug, targetSlugSet, report);

    const frontmatter = buildFrontmatter(title, gscSlug, dateStr, description);
    await fsp.writeFile(path.join(CONTENT_DIR, `${gscSlug}.md`), `${frontmatter}\n\n${md.trim()}\n`, 'utf-8');
    report.processed.push({ slug: gscSlug, matchType });
  }

  // ── Step A: 백업 매칭 처리 ─────────────────────────────────────────────────
  let count = 0;
  const total = matchMap.size;

  for (const [gscSlug, match] of matchMap) {
    count++;
    process.stdout.write(`[${count}/${total}] (백업) ${gscSlug.slice(0, 50)}...\r`);
    let htmlContent;
    try {
      htmlContent = fs.readFileSync(match.htmlPath, 'utf-8');
    } catch (e) {
      report.skipped.push({ slug: gscSlug, reason: `파일 읽기 실패: ${e.message}` });
      continue;
    }
    try {
      await processPost(gscSlug, htmlContent, match.imgDir, match.matchType);
    } catch (e) {
      report.skipped.push({ slug: gscSlug, reason: e.message });
    }
  }

  // ── Step B: 미매칭 → infoepic.com live fetch ───────────────────────────────
  const unmatched = [...targets.keys()].filter(s => !matchMap.has(s));
  console.log(`\n\n[4] 미매칭 ${unmatched.length}개 live fetch 시도...\n`);

  let liveCount = 0;
  for (const gscSlug of unmatched) {
    liveCount++;
    process.stdout.write(`[${liveCount}/${unmatched.length}] (live) ${gscSlug.slice(0, 50)}...\r`);

    try {
      const url = `https://infoepic.com/entry/${encodeURIComponent(gscSlug)}`;
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (!res.ok) {
        report.skipped.push({ slug: gscSlug, reason: `live HTTP ${res.status}` });
        continue;
      }
      const html = await res.text();
      if (!html.includes('contents_style')) {
        report.skipped.push({ slug: gscSlug, reason: 'live: contents_style 없음 (비공개/삭제)' });
        continue;
      }
      await processPost(gscSlug, html, null, 'live');
    } catch (e) {
      report.skipped.push({ slug: gscSlug, reason: `live 오류: ${e.message}` });
    }

    await new Promise(r => setTimeout(r, 400));
  }

  console.log('\n\n=== 완료 ===\n');
  console.log(`성공: ${report.processed.length}개`);
  console.log(`실패/건너뜀: ${report.skipped.length}개`);
  console.log(`이미지 실패: ${report.imageFailures.length}개`);
  console.log(`외부 이미지 잔존: ${report.externalImagesRemaining.length}개`);
  console.log(`애드센스 잔존: ${report.adsenseRemaining.length}개`);
  console.log(`끊긴 내부 링크: ${report.brokenLinks.length}개`);

  await writeReport(report);
  console.log(`\n보고서: ${REPORT_PATH}`);
}

async function writeReport(report) {
  const lines = [
    '# Migration Report v2',
    `> 생성: ${new Date().toLocaleString('ko-KR')}`,
    '',
    '## 요약',
    `| 항목 | 수 |`,
    `|------|---|`,
    `| 성공 | ${report.processed.length} |`,
    `| 실패 | ${report.skipped.length} |`,
    `| 이미지 실패 | ${report.imageFailures.length} |`,
    `| 외부 이미지 잔존 | ${report.externalImagesRemaining.length} |`,
    `| 애드센스 잔존 | ${report.adsenseRemaining.length} |`,
    `| 끊긴 내부 링크 | ${report.brokenLinks.length} |`,
    '',
  ];

  if (report.skipped.length > 0) {
    lines.push('## 실패/건너뜀');
    for (const { slug, reason } of report.skipped) lines.push(`- \`${slug}\`: ${reason}`);
    lines.push('');
  }

  if (report.imageFailures.length > 0) {
    lines.push('## 이미지 다운로드 실패');
    for (const { slug, url, error } of report.imageFailures) lines.push(`- **${slug}**: ${url} → ${error}`);
    lines.push('');
  }

  if (report.externalImagesRemaining.length > 0) {
    lines.push('## 외부 이미지 잔존 (수동 처리 필요)');
    for (const { slug, url } of report.externalImagesRemaining) lines.push(`- **${slug}**: ${url}`);
    lines.push('');
  }

  if (report.adsenseRemaining.length > 0) {
    lines.push('## ⚠️ 애드센스 흔적 잔존');
    for (const slug of report.adsenseRemaining) lines.push(`- \`${slug}\``);
    lines.push('');
  }

  if (report.brokenLinks.length > 0) {
    lines.push('## 끊긴 내부 링크');
    for (const { from, to } of report.brokenLinks) lines.push(`- \`${from}\` → \`${to}\``);
    lines.push('');
  }

  lines.push('## 성공 목록');
  for (const { slug, matchType } of report.processed) {
    lines.push(`- [${matchType}] ${slug}`);
  }

  await fsp.writeFile(REPORT_PATH, lines.join('\n'), 'utf-8');
}

main().catch(e => { console.error('오류:', e); process.exit(1); });
