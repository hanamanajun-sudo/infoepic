import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

function rehypeLazyImages() {
  function walk(node) {
    if (node.type === 'element' && node.tagName === 'img') {
      node.properties = node.properties || {};
      if (!node.properties.loading) node.properties.loading = 'lazy';
      if (!node.properties.decoding) node.properties.decoding = 'async';
    }
    if (node.children) node.children.forEach(walk);
  }
  return (tree) => walk(tree);
}

// 단독 유튜브 링크를 iframe 임베드로 자동 변환
function rehypeYouTubeEmbed() {
  function getYouTubeInfo(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'youtu.be') {
        return { id: u.pathname.slice(1), start: u.searchParams.get('t') };
      }
      if (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') {
        return { id: u.searchParams.get('v'), start: u.searchParams.get('t') };
      }
    } catch {}
    return null;
  }

  function walk(node) {
    if (node.children) {
      node.children = node.children.map(child => {
        if (child.type !== 'element' || child.tagName !== 'p') return walk(child) || child;

        const nonEmpty = child.children.filter(c => !(c.type === 'text' && c.value.trim() === ''));
        if (nonEmpty.length !== 1) return walk(child) || child;

        const anchor = nonEmpty[0];
        if (anchor.type !== 'element' || anchor.tagName !== 'a') return walk(child) || child;

        const href = anchor.properties?.href || '';
        const yt = getYouTubeInfo(href);
        if (!yt?.id) return walk(child) || child;

        let src = `https://www.youtube-nocookie.com/embed/${yt.id}`;
        if (yt.start) src += `?start=${yt.start}`;

        return {
          type: 'element',
          tagName: 'div',
          properties: { class: 'youtube-embed' },
          children: [{
            type: 'element',
            tagName: 'iframe',
            properties: {
              src,
              title: 'YouTube video player',
              frameBorder: '0',
              allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
              allowFullScreen: true,
              loading: 'lazy',
            },
            children: [],
          }],
        };
      });
    }
    return node;
  }

  return (tree) => walk(tree);
}

// 외부 링크(http/https로 시작)에 target="_blank" + rel="noopener noreferrer" 자동 적용
function rehypeExternalLinks() {
  function walk(node) {
    if (node.type === 'element' && node.tagName === 'a') {
      const href = node.properties?.href || '';
      if (href.startsWith('http://') || href.startsWith('https://')) {
        node.properties.target = '_blank';
        node.properties.rel = 'noopener noreferrer';
      }
    }
    if (node.children) node.children.forEach(walk);
  }
  return (tree) => walk(tree);
}

export default defineConfig({
  site: 'https://infoepic.com',
  integrations: [mdx(), sitemap()],
  markdown: {
    rehypePlugins: [rehypeLazyImages, rehypeYouTubeEmbed, rehypeExternalLinks],
  },
  output: 'static',
  build: {
    format: 'file',
  },
  trailingSlash: 'never',
  vite: {
    plugins: [tailwindcss()],
  },
});
