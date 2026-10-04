/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Edit this file to change everything the visitor reads.
 *
 *  • profile  – name, tagline, About text, skills, contact links.
 *  • projects – one entry per cartridge, in shelf order.
 *
 *  Starter project text is deliberately neutral. Entries marked
 *  `placeholder: true` still need your real description, role and media.
 *  Links are only rendered when a URL is present, so leave liveUrl/sourceUrl
 *  out until you have a real address.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Profile, Project } from './types'

export const profile: Profile = {
  name: 'Dorukan Kılınç',
  // From the GitHub profile README – edit freely.
  tagline: 'Full stack developer, game developer and 3D artist from Turkey',
  about: [
    'Hi, I’m Dorukan — a full stack developer, game developer and 3D artist from Turkey.',
    'I like building things people can play with: mobile apps, websites, little games and hardware experiments. This room holds a few of them — pick a cartridge to take a closer look.',
  ],
  notes: [
    { label: 'Working with', value: 'C++, Java' },
    { label: 'Learning', value: 'Python, JavaScript, React, Vue, Node.js' },
    { label: 'Open to', value: 'Collaborating on game development' },
  ],
  skills: [
    'Java',
    'C++',
    'Python',
    'JavaScript',
    'HTML & CSS',
    'React',
    'Vue.js',
    'Node.js',
    'MySQL',
    'Git',
    'Linux',
    'AWS',
    'Blender',
    'Unreal Engine',
    'MATLAB',
  ],
  contactIntro:
    'The easiest way to reach me is by email. I’m especially happy to talk about game development.',
  contact: [
    { label: 'Email', href: 'mailto:dorukankilinc28@gmail.com', text: 'dorukankilinc28@gmail.com' },
    { label: 'GitHub', href: 'https://github.com/dorukanklnc', text: 'github.com/dorukanklnc' },
    { label: 'Instagram', href: 'https://instagram.com/dorukan_klnc', text: '@dorukan_klnc' },
    // Add LinkedIn here once you have the exact profile URL, e.g.
    // { label: 'LinkedIn', href: 'https://www.linkedin.com/in/<your-handle>', text: 'linkedin.com/in/<your-handle>' },
  ],
}

const demo = (slug: string, alt: string) => ({
  src: `projects/${slug}/preview.svg`,
  alt,
  demo: true,
})

export const projects: Project[] = [
  {
    slug: 'akil-adasi',
    title: 'Akıl Adası',
    type: 'Android app',
    summary: 'An Android app written in Java.',
    role: 'Developer',
    technologies: ['Android', 'Java'],
    thumbnail: demo('akil-adasi', 'Demo illustration of the Akıl Adası app on an Android phone'),
    screenshots: [demo('akil-adasi', 'Demo illustration of the Akıl Adası app on an Android phone')],
    labelColor: '#B9D35A',
    emblem: 'AA',
    placeholder: true,
  },
  {
    slug: 'rolebluff',
    title: 'RoleBluff',
    type: 'iOS app',
    summary: 'An iOS app built with SwiftUI.',
    role: 'Developer',
    technologies: ['iOS', 'Swift', 'SwiftUI'],
    thumbnail: demo('rolebluff', 'Demo illustration of the RoleBluff app on an iPhone'),
    screenshots: [demo('rolebluff', 'Demo illustration of the RoleBluff app on an iPhone')],
    labelColor: '#8E6CCF',
    emblem: 'RB',
    placeholder: true,
  },
  {
    slug: 'altinyildiz-koleji',
    title: 'Altınyıldız Koleji',
    type: 'Website',
    summary: 'A website for Altınyıldız Koleji.',
    role: 'Developer',
    technologies: ['Web'],
    thumbnail: demo('altinyildiz-koleji', 'Demo illustration of a school website in a browser window'),
    screenshots: [
      demo('altinyildiz-koleji', 'Demo illustration of a school website in a browser window'),
    ],
    labelColor: '#E0B33F',
    emblem: 'AK',
    placeholder: true,
  },
  {
    slug: 'rfid-attendance',
    title: 'RFID Attendance System',
    type: 'Python · Hardware',
    summary: 'An attendance system that uses RFID cards, written in Python.',
    role: 'Developer',
    technologies: ['Python', 'RFID', 'Hardware'],
    thumbnail: demo('rfid-attendance', 'Demo illustration of an RFID reader wired to a small computer'),
    screenshots: [
      demo('rfid-attendance', 'Demo illustration of an RFID reader wired to a small computer'),
    ],
    labelColor: '#E26D7A',
    emblem: 'ID',
    placeholder: true,
  },
  {
    slug: 'ai-experiments',
    title: 'AI Experiments',
    type: 'Placeholder',
    summary:
      'A placeholder cartridge. Replace it with a real AI project or remove it from src/content/portfolio.ts.',
    technologies: ['To be added'],
    thumbnail: demo('ai-experiments', 'Placeholder illustration of a small node graph'),
    screenshots: [demo('ai-experiments', 'Placeholder illustration of a small node graph')],
    labelColor: '#6CC3B5',
    emblem: 'AI',
    placeholder: true,
  },
]

export function findProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug)
}
