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

export default defineConfig({
  site: 'https://infoepic.com',
  integrations: [mdx(), sitemap()],
  markdown: {
    rehypePlugins: [rehypeLazyImages],
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
