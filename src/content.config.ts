import { defineCollection, reference, z } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { CATEGORY_SLUGS } from './data/categories';
import { STATUS_SLUGS } from './data/statuses';
import { LINK_TYPE_SLUGS } from './data/linkTypes';
import { EVENT_TYPE_SLUGS } from './data/eventTypes';

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

/** Upcoming streams, videos, posts and releases. One YAML file, one list. */
const schedule = defineCollection({
  loader: file('./src/content/schedule.yaml'),
  schema: z
    .object({
      id: z.string().regex(/^[a-z0-9-]+$/, 'id: lowercase letters, digits and dashes only'),
      title: z.string().min(1),
      start: z.coerce.date(),
      end: z.coerce.date().optional(),
      type: z.enum(EVENT_TYPE_SLUGS),
      platform: z.enum(LINK_TYPE_SLUGS).optional(),
      url: z.string().url().optional(),
      project: reference('projects').optional(),
      note: z.string().max(200).optional(),
      tentative: z.boolean().default(false),
      /** Drafts are visible in `astro dev` only. */
      draft: z.boolean().default(false),
    })
    .refine((e) => !e.end || e.end > e.start, { message: 'end must be after start', path: ['end'] }),
});

export const collections = { projects, updates, schedule };
