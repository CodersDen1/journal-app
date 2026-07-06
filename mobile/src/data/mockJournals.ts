import type { JournalEntry } from '../types';

/**
 * Seed entries. Calm, adult, reflective — used on first launch and as a
 * fallback when local storage is empty. Photos use stable placeholder URLs.
 */
export const mockJournals: JournalEntry[] = [
  {
    id: 'seed-1',
    createdAt: '2026-07-06T08:12:00.000Z',
    updatedAt: '2026-07-06T08:12:00.000Z',
    type: 'text',
    text:
      'Woke before the alarm and let the house stay quiet for a while. There is a particular kind of calm in the hour before anyone needs anything from you. I made coffee slowly and watched the light move across the kitchen wall. I want to remember that I have this, that it is available most mornings if I choose it.',
    transcript: '',
    audioUri: null,
    audioDuration: 0,
    photos: [],
    favorite: true,
    archived: false,
    deleted: false,
  },
  {
    id: 'seed-2',
    createdAt: '2026-07-05T20:44:00.000Z',
    updatedAt: '2026-07-05T20:44:00.000Z',
    type: 'voice',
    text: '',
    transcript:
      'Long walk after dinner. I kept thinking about the conversation with Maya and how much lighter I felt afterwards. I think I have been carrying that worry for weeks without naming it. Saying it out loud to someone made it smaller.',
    audioUri: null,
    audioDuration: 107,
    photos: [],
    favorite: false,
    archived: false,
    deleted: false,
  },
  {
    id: 'seed-3',
    createdAt: '2026-07-04T18:03:00.000Z',
    updatedAt: '2026-07-04T18:03:00.000Z',
    type: 'text',
    text:
      'We drove up to the coast with no real plan. Cold water, warm rocks, a thermos of tea. The kind of day that does not photograph well but stays with you anyway. I noticed I was not reaching for my phone.',
    transcript: '',
    audioUri: null,
    audioDuration: 0,
    photos: [
      'https://picsum.photos/seed/still-coast-a/900/1200',
      'https://picsum.photos/seed/still-coast-b/900/1200',
      'https://picsum.photos/seed/still-coast-c/900/1200',
    ],
    favorite: false,
    archived: false,
    deleted: false,
  },
  {
    id: 'seed-4',
    createdAt: '2026-07-03T07:30:00.000Z',
    updatedAt: '2026-07-03T07:30:00.000Z',
    type: 'text',
    text:
      'A restless night, then a good morning anyway. I am learning not to let the first hour decide the whole day. Small reset: water, stretch, ten minutes outside before the desk.',
    transcript: '',
    audioUri: null,
    audioDuration: 0,
    photos: [],
    favorite: false,
    archived: false,
    deleted: false,
  },
  {
    id: 'seed-5',
    createdAt: '2026-07-01T21:15:00.000Z',
    updatedAt: '2026-07-01T21:15:00.000Z',
    type: 'voice',
    text: '',
    transcript:
      'Just finished a hard week at work but I feel oddly proud of how I handled the Thursday meeting. I stayed steady, I did not over-explain, I let the silence do some of the work. Noting it so I remember I can do that.',
    audioUri: null,
    audioDuration: 63,
    photos: [],
    favorite: true,
    archived: false,
    deleted: false,
  },
  {
    id: 'seed-6',
    createdAt: '2026-06-29T19:50:00.000Z',
    updatedAt: '2026-06-29T19:50:00.000Z',
    type: 'text',
    text:
      'Cooked properly for the first time in weeks. Nothing ambitious, just something that took attention. Chopping, waiting, tasting. It reminded me that slowness is not the same as wasting time.',
    transcript: '',
    audioUri: null,
    audioDuration: 0,
    photos: ['https://picsum.photos/seed/still-kitchen/900/1200'],
    favorite: false,
    archived: false,
    deleted: false,
  },
  {
    id: 'seed-7',
    createdAt: '2026-06-27T09:05:00.000Z',
    updatedAt: '2026-06-27T09:05:00.000Z',
    type: 'text',
    text:
      'Grateful this morning for ordinary things: a made bed, a working body, a phone call that did not need to happen but did. I want to keep a lighter grip on the day.',
    transcript: '',
    audioUri: null,
    audioDuration: 0,
    photos: [],
    favorite: false,
    archived: true,
    deleted: false,
  },
];
