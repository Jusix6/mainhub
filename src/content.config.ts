import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORY_SLUGS } from './data/categories';
import { STATUS_SLUGS } from './data/statuses';
import { LINK_TYPE_SLUGS } from './data/linkTypes';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      tagline: z.string().max(80),
      category: z.enum(CATEGORY_SLUGS),
      status: z.enum(STATUS_SLUGS),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      featured: z.boolean().default(false),
      cover: image(),
      gallery: z.array(image()).default([]),
      platforms: z.array(z.string()).default([]),
      tech: z.array(z.string()).default([]),
      tags: z.array(z.string()).default([]),
      links: z
        .array(
          z.object({
            type: z.enum(LINK_TYPE_SLUGS),
            url: z.string().url(),
            label: z.string().optional(),
          }),
        )
        .default([]),
    }),
});

const updates = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/updates' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      date: z.coerce.date(),
      type: z.enum(['devlog', 'release', 'news']).default('devlog'),
      project: reference('projects').optional(),
      cover: image().optional(),
      /** Drafts are visible in `astro dev` only and never built for production. */
      draft: z.boolean().default(false),
    }),
});

export const collections = { projects, updates };
