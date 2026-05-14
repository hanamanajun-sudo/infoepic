import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date().optional(),
    draft: z.boolean().optional(),
    category: z.string().optional(),
    thumbnail: z.string().optional(),
  }),
});

export const collections = { blog };
