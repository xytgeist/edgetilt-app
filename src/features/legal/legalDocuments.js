import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ENTITY_NAME,
  LEGAL_ENTITY_STATE,
} from './legalPolicyVersion.js'

/**
 * @typedef {{ id: string, heading?: string, paragraphs: string[] }} LegalSection
 * @typedef {{ slug: 'terms' | 'privacy' | 'guidelines', title: string, effectiveDate: string, intro?: string, sections: LegalSection[] }} LegalDocument
 */

/** @type {Record<'terms' | 'privacy' | 'guidelines', LegalDocument>} */
export const LEGAL_DOCUMENTS = {
  terms: {
    slug: 'terms',
    title: 'Terms & Conditions',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    intro:
      'These Terms & Conditions ("Terms") govern your access to and use of the EDGE mobile and web application and related services (collectively, the "Service") operated by ' +
      `${LEGAL_ENTITY_NAME}, a ${LEGAL_ENTITY_STATE} limited liability company ("we," "us," or "our"). By creating an account or using the Service, you agree to these Terms and our Privacy Policy.`,
    sections: [
      {
        id: 'about',
        heading: '1. About the Service',
        paragraphs: [
          'EDGE (also branded LVSlotPro) is a community and tooling platform for slot and advantage-play enthusiasts. Features may include social feeds ("Lounge"), calculators, play logbooks, bankroll tracking, offers calendars, AP guides, messaging, and related content.',
          'The Service is provided for informational and entertainment purposes. We do not operate casinos, accept wagers, or facilitate gambling.',
        ],
      },
      {
        id: 'eligibility',
        heading: '2. Eligibility',
        paragraphs: [
          'You must be at least 18 years old (or the age of majority in your jurisdiction, if higher) to create an account.',
          'You are responsible for ensuring that your use of the Service complies with all applicable laws, casino rules, and local regulations. The Service is not legal, tax, or financial advice.',
        ],
      },
      {
        id: 'accounts',
        heading: '3. Accounts and security',
        paragraphs: [
          'You must provide accurate registration information and keep your credentials secure. You are responsible for activity under your account.',
          'We may suspend or terminate accounts that violate these Terms, our community guidelines, or applicable law, or that pose risk to other users or the Service.',
          'You may delete your account through in-app settings where available. Deletion is permanent for data tied to your account, subject to our Privacy Policy and legal retention requirements.',
        ],
      },
      {
        id: 'subscriptions',
        heading: '4. Subscriptions and billing',
        paragraphs: [
          'Some features may require a paid subscription or add-on. Prices, billing intervals, and included features are shown at checkout or in-product.',
          'Payments are processed by third-party providers (such as Stripe). By subscribing, you authorize recurring charges according to the plan you select until you cancel.',
          'Refunds, if any, are handled according to the policy displayed at purchase and applicable law. We may change pricing or plan features with reasonable notice where required.',
        ],
      },
      {
        id: 'user-content',
        heading: '5. User content and conduct',
        paragraphs: [
          'You retain ownership of content you post (text, images, video, comments, and similar materials). You grant us a non-exclusive, worldwide, royalty-free license to host, display, reproduce, and distribute your content solely to operate and improve the Service.',
          'You agree not to post unlawful, harassing, defamatory, infringing, or misleading content; spam; malware; or content that violates others\' privacy or intellectual property rights.',
          'We may remove content or restrict accounts at our discretion, including for moderation and safety. We are not obligated to monitor all user content.',
        ],
      },
      {
        id: 'play-logbook',
        heading: '6. Play Logbook and product improvement',
        paragraphs: [
          'When you log plays in the Play Logbook, we store session data you enter (such as game or template, bet size, denomination, counters, meters, cash in/out, calculator snapshots, casino name, notes, dates, and related metrics).',
          'You grant us permission to use Play Logbook and related usage data, in identifiable or aggregated and de-identified form, to operate the Service, improve calculator accuracy, EV models, take-point guidance, AP guides, and other product features. Details appear in our Privacy Policy.',
          'We do not sell your personal Play Logbook entries to third parties for their marketing purposes.',
        ],
      },
      {
        id: 'ip',
        heading: '7. Our intellectual property',
        paragraphs: [
          'The Service, including software, design, logos, calculators, guides, and documentation (excluding your user content), is owned by us or our licensors and protected by intellectual property laws.',
          'You may not copy, reverse engineer, scrape, or resell the Service or its content except as expressly permitted or required by law.',
        ],
      },
      {
        id: 'disclaimers',
        heading: '8. Disclaimers',
        paragraphs: [
          'Calculators, guides, take points, and community posts are estimates and opinions. Outcomes on real machines vary. Past results do not guarantee future results.',
          'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.',
        ],
      },
      {
        id: 'liability',
        heading: '9. Limitation of liability',
        paragraphs: [
          'TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE AND OUR OFFICERS, DIRECTORS, EMPLOYEES, AND SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE.',
          'OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF (A) AMOUNTS YOU PAID US IN THE TWELVE MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED U.S. DOLLARS (USD $100).',
          'Some jurisdictions do not allow certain limitations; in those cases our liability is limited to the fullest extent permitted by law.',
        ],
      },
      {
        id: 'indemnity',
        heading: '10. Indemnification',
        paragraphs: [
          'You agree to indemnify and hold us harmless from claims, damages, and expenses (including reasonable attorneys\' fees) arising from your use of the Service, your content, or your violation of these Terms or applicable law.',
        ],
      },
      {
        id: 'changes',
        heading: '11. Changes to these Terms',
        paragraphs: [
          'We may update these Terms from time to time. We will post the revised version with a new effective date and, where required, provide additional notice or request renewed acceptance before continued use.',
          'Your continued use after changes become effective constitutes acceptance of the updated Terms, except where we require explicit re-acceptance.',
        ],
      },
      {
        id: 'governing-law',
        heading: '12. Governing law',
        paragraphs: [
          `These Terms are governed by the laws of the State of ${LEGAL_ENTITY_STATE}, without regard to conflict-of-law rules, except where mandatory consumer protection laws in your jurisdiction apply.`,
          'Disputes will be resolved in the courts located in Wyoming, unless applicable law requires otherwise.',
        ],
      },
      {
        id: 'contact',
        heading: '13. Contact',
        paragraphs: [
          `Questions about these Terms: ${LEGAL_CONTACT_EMAIL}.`,
          `${LEGAL_ENTITY_NAME} (${LEGAL_ENTITY_STATE}).`,
        ],
      },
    ],
  },
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    intro:
      'This Privacy Policy describes how ' +
      `${LEGAL_ENTITY_NAME} ("we," "us," or "our") collects, uses, and shares information when you use the EDGE / LVSlotPro application and related services (the "Service"). It applies alongside our Terms & Conditions.`,
    sections: [
      {
        id: 'collect',
        heading: '1. Information we collect',
        paragraphs: [
          'Account information: email address, authentication identifiers, profile details you provide (display name, handle, avatar, banner, bio, location, category pills), and account settings.',
          'Usage and device information: app interactions, feature usage, approximate location when you grant permission (for example, to suggest a nearby casino for bankroll or logbook capture), device type, browser, IP address, and diagnostic logs.',
          'Content you create: Lounge posts, comments, reactions, bookmarks, chat messages, media uploads, offers calendar entries, bankroll sessions, and Play Logbook entries including metric values, casino names, notes, and timestamps.',
          'Payment information: subscriptions are processed by Stripe. We receive billing status and customer identifiers from Stripe; we do not store full payment card numbers on our servers.',
          'Push notifications: if enabled, we store device push subscription endpoints and your notification preferences.',
        ],
      },
      {
        id: 'cookies',
        heading: '2. Cookies and similar technologies',
        paragraphs: [
          'We use cookies, local storage, and similar browser technologies ("cookies" in this section) to run the Service. We do not use third-party advertising or cross-site tracking cookies today.',
          'Strictly necessary: Supabase authentication stores session tokens so you stay signed in. Stripe may set cookies when you complete checkout or manage billing. These are required for login and payments.',
          'Preferences and app state: we store settings on your device with local storage (for example, light/dark theme, Lounge feed preferences, quick-link shortcuts, composer drafts, and similar UI state). This keeps the app working the way you left it.',
          'Push notifications: if you enable alerts, your browser or installed app may store a push subscription identifier tied to this device.',
          'Fonts and media: we load fonts from Google Fonts. Embedded YouTube videos in chat use YouTube\'s privacy-enhanced (nocookie) embed where configured. Cloudflare and other infrastructure providers may process technical data when you load images or video.',
          'Your choices: you can clear site data or cookies in your browser settings, which may sign you out and reset local preferences. Most browsers also let you block third-party cookies; blocking all cookies may prevent login or checkout from working.',
          'If we add optional analytics or marketing cookies in the future, we will update this Policy and, where required by law, ask for your consent before using them.',
        ],
      },
      {
        id: 'play-logbook',
        heading: '3. Play Logbook and product analytics',
        paragraphs: [
          'Play Logbook data helps you track sessions and analyze results. We also use this data to improve the Service, including calculator accuracy, expected-value models, take-point guidance, and AP guide content.',
          'We may analyze Play Logbook entries in aggregate or in de-identified form. Analysis may include metrics such as game or template type, bet size, denomination, counters, meters, cash in/out, spins, bonus counts, calculator snapshots (for example, EV or RTP at time of play), session timing, and derived statistics such as realized return or net profit/loss.',
          'Free-text notes and casino names may be excluded from analytics datasets or redacted where feasible. Shared play sessions may be counted once per session for statistical purposes rather than once per participant.',
          'We do not sell Play Logbook data to third parties for their independent marketing.',
        ],
      },
      {
        id: 'use',
        heading: '4. How we use information',
        paragraphs: [
          'Provide, maintain, and secure the Service; authenticate users; sync your data across devices.',
          'Personalize your experience (for example, profile display, feed ranking, and saved preferences).',
          'Send transactional messages (account verification, password reset, billing receipts) and, with your consent, push notifications.',
          'Moderate content, prevent abuse, and enforce our Terms and community guidelines.',
          'Analyze usage and Play Logbook data to improve calculators, guides, and product features as described above.',
          'Comply with legal obligations and respond to lawful requests.',
        ],
      },
      {
        id: 'share',
        heading: '5. How we share information',
        paragraphs: [
          'Public profile and Lounge content: information you choose to make public (such as posts, handle, and public profile fields) is visible to other users according to product settings and RLS policies.',
          'Service providers: we use vendors such as Supabase (database and auth), Vercel (hosting), Cloudflare (media and video), Stripe (payments), and push notification infrastructure. They process data on our behalf under contractual safeguards.',
          'Legal and safety: we may disclose information if required by law, to protect rights and safety, or to investigate fraud or abuse.',
          'Business transfers: if we merge, sell assets, or reorganize, user information may transfer as part of that transaction, subject to this Policy.',
          'We do not sell your personal information for cross-context behavioral advertising.',
        ],
      },
      {
        id: 'retention',
        heading: '6. Data retention',
        paragraphs: [
          'We retain information while your account is active and as needed to provide the Service.',
          'When you delete your account, we delete or anonymize associated personal data within a reasonable period, except where we must retain records for legal, security, or backup purposes.',
          'Aggregated or de-identified analytics derived from Play Logbook data may be retained longer because it no longer identifies you.',
        ],
      },
      {
        id: 'security',
        heading: '7. Security',
        paragraphs: [
          'We use industry-standard measures such as encryption in transit (HTTPS), access controls, and row-level security in our database. No method of transmission or storage is 100% secure.',
          'You are responsible for safeguarding your login credentials and devices.',
        ],
      },
      {
        id: 'rights',
        heading: '8. Your choices and rights',
        paragraphs: [
          'You may update profile information, adjust notification settings, export certain data where the app provides export tools, and delete your account in settings.',
          'Depending on your location, you may have rights to access, correct, delete, or port personal data, or to object to or restrict certain processing. Contact us to exercise these rights.',
          'You may opt out of marketing emails using unsubscribe links. Push notifications can be disabled in device and in-app settings.',
        ],
      },
      {
        id: 'children',
        heading: '9. Children',
        paragraphs: [
          'The Service is not directed to children under 18. We do not knowingly collect personal information from children. Contact us if you believe a child has provided us data.',
        ],
      },
      {
        id: 'international',
        heading: '10. International users',
        paragraphs: [
          'We operate from the United States. If you access the Service from other regions, your information may be processed in the U.S. or where our service providers operate.',
        ],
      },
      {
        id: 'changes',
        heading: '11. Changes to this Policy',
        paragraphs: [
          'We may update this Privacy Policy from time to time. We will post the revised version with a new effective date and provide additional notice or request renewed acceptance where required.',
        ],
      },
      {
        id: 'contact',
        heading: '12. Contact',
        paragraphs: [
          `Privacy questions or requests: ${LEGAL_CONTACT_EMAIL}.`,
          `${LEGAL_ENTITY_NAME} (${LEGAL_ENTITY_STATE}).`,
        ],
      },
    ],
  },
  guidelines: {
    slug: 'guidelines',
    title: 'Community Guidelines',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    intro:
      'These Community Guidelines explain how we expect members to behave on EDGE (LVSlotPro). They apply to the Lounge feed, comments, direct messages, group chats, profiles, and any other social or community features ... whether you are here for slots, sports, trading, investing, or any other edge-hunting niche. They work together with our Terms & Conditions and Privacy Policy.',
    sections: [
      {
        id: 'purpose',
        heading: '1. What EDGE is for',
        paragraphs: [
          'EDGE is a community for advantage play, gambling, and edge-hunting - slots and casino AP, sports betting, trading, investing, and similar pursuits. Share experiences, learn from each other, and use the tools in the app.',
          'This is a free speech platform. Say whatever you want, but keep it constructive. Disagreement is fine; harassment is not. Bottom line: just don\'t be a dick.',
        ],
      },
      {
        id: 'respect',
        heading: '2. Be respectful',
        paragraphs: [
          'Treat other members like people you would talk to at a meetup or in a trusted group chat.',
          'Do not harass, bully, threaten, or demean others based on identity, skill level, bankroll, location, or opinions about strategy or markets.',
          'Do not dox anyone. Do not share another person\'s private contact info, home address, employer, or real-time location without their clear permission.',
        ],
      },
      {
        id: 'honest',
        heading: '3. Be honest and on-topic',
        paragraphs: [
          'Share what you actually saw, played, or measured when posting results, setups, or take-point advice. Do not knowingly mislead the community.',
          'Label speculation and humor when it could be mistaken for fact. Satire is fine; scams and fake "guaranteed" systems are not.',
          'Stay relevant to gambling, edge play, bankroll, markets, sports, casinos, and related topics. Off-topic spam and repetitive self-promotion may be removed.',
        ],
      },
      {
        id: 'content',
        heading: '4. Content standards',
        paragraphs: [
          'You may not post content that is illegal, promotes illegal activity, or violates venue, platform, or property rules in a way that puts others at risk.',
          'No sexually explicit content, gratuitous violence, or content that exploits minors (zero tolerance).',
          'No malware, phishing links, or attempts to steal accounts or payment information.',
          'Only post media you have the right to share. Respect copyright and casino photography policies where they apply.',
        ],
      },
      {
        id: 'privacy-safety',
        heading: '5. Privacy and safety',
        paragraphs: [
          'Do not share photos or video that clearly identify other patrons or casino staff without their consent.',
          'Use good judgment before posting machine IDs, player cards, offers mailers, or documents that could identify you or others in ways you did not intend.',
          'Report suspicious behavior to us rather than public witch hunts.',
        ],
      },
      {
        id: 'commerce',
        heading: '6. Commerce and solicitation',
        paragraphs: [
          'Do not use EDGE to sell illegal goods or services, run pyramid schemes, or solicit members for unrelated multi-level marketing.',
          'Reasonable community help (referrals, meetups, discussing subscriptions inside the product) is fine. Persistent unsolicited DMs selling external products are not.',
        ],
      },
      {
        id: 'moderation',
        heading: '7. Moderation and enforcement',
        paragraphs: [
          'We may remove content, limit visibility, mute features, or suspend accounts that break these Guidelines, our Terms, or applicable law.',
          'Moderators and admins may take action without prior warning for severe violations (threats, illegal content, exploitation, coordinated harassment).',
          'Enforcement decisions are not public debates. You may appeal in good faith by emailing ' + LEGAL_CONTACT_EMAIL + '.',
        ],
      },
      {
        id: 'reporting',
        heading: '8. How to report',
        paragraphs: [
          'If you see content or behavior that violates these Guidelines, use in-app reporting where available or email ' + LEGAL_CONTACT_EMAIL + ' with links, screenshots, and context.',
          'False or abusive reports may themselves lead to account action.',
        ],
      },
      {
        id: 'your-part',
        heading: '9. Your part',
        paragraphs: [
          'You are responsible for what you post under your account, including replies and reposts.',
          'Blocking and muting are tools for your comfort, but they do not replace reporting serious issues to us.',
          'These Guidelines may be updated. Continued use of community features after an update means you accept the current version.',
        ],
      },
      {
        id: 'contact',
        heading: '10. Contact',
        paragraphs: [
          `Questions about these Guidelines: ${LEGAL_CONTACT_EMAIL}.`,
          `${LEGAL_ENTITY_NAME} (${LEGAL_ENTITY_STATE}).`,
        ],
      },
    ],
  },
}

/** @param {'terms' | 'privacy' | 'guidelines'} slug */
export function getLegalDocument(slug) {
  return LEGAL_DOCUMENTS[slug] ?? null
}

export function parseLegalPathname(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/'
  if (path === '/terms') return 'terms'
  if (path === '/privacy') return 'privacy'
  if (path === '/guidelines') return 'guidelines'
  return null
}
