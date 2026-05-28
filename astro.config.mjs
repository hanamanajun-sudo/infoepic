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
    rehypePlugins: [rehypeLazyImages, rehypeExternalLinks],
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
