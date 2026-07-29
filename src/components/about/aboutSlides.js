/**
 * The About deck's copy, shared.
 *
 * The onboarding intro shows this same deck as the first thing a new user
 * sees, so the slides live here rather than inside AboutBloom: one list,
 * two rooms it plays in.
 */
export const ABOUT_SLIDES = [
  {
    id: 'about',
    kicker: 'About',
    heading: 'A calm record of the support you give.',
    body: 'A daily record of the accommodations you deliver, so you can show your work when someone asks.',
    hero: true,
  },
  {
    id: 'private',
    kicker: 'Private by design',
    // The one kicker in accent rather than brand: it is the product's central
    // promise, and the spec singles it out.
    accentKicker: true,
    heading: 'Nothing leaves this computer.',
    body: 'Everything lives in one file on this computer. No account, no database, no network. It cannot send your students’ information anywhere.',
  },
  {
    id: 'why',
    kicker: 'Why it was built',
    heading: 'Paperwork built for auditors, not for teachers.',
    body: 'Documenting IEP and 504 support is required, and the systems that exist for it are mostly built for administrators rather than for the person actually teaching. They ask for a lot of clicks, at the end of a day when you have none left.',
  },
  {
    id: 'who',
    kicker: 'Who it’s for',
    heading: 'For the person delivering the support.',
    body: 'Classroom teachers with IEP and 504 students, not the office auditing them. A board you can run down in a few minutes after the last bell, that turns into a report when someone needs one.',
  },
  {
    id: 'next',
    kicker: 'Where it goes next',
    heading: 'Small on purpose.',
    body: 'An end-of-day close-out that seals each record, printable reports ready for compliance submission, and bulk actions for the busy days. Never an account, never a sync. That part doesn’t change.',
  },
];
