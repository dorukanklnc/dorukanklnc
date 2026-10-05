/**
 * Entirely fictional demo data. Names are common Turkish given names and surnames combined at
 * random; e-mail addresses use reserved domains (.test, example.com); phone numbers use the
 * unassigned 0500 000 range. No real person's data is used.
 */
export const FEMALE_NAMES = [
  'Elif', 'Zeynep', 'Ayşe', 'Defne', 'Ecrin', 'Azra', 'Nehir', 'Ela', 'Mira', 'Duru',
  'İpek', 'Selin', 'Irmak', 'Melis', 'Asya', 'Eylül', 'Lina', 'Nil', 'Öykü', 'Su',
];

export const MALE_NAMES = [
  'Ahmet', 'Mehmet', 'Yusuf', 'Emir', 'Ömer', 'Mustafa', 'Kerem', 'Aras', 'Eymen', 'Alparslan',
  'Çınar', 'Deniz', 'Kaan', 'Arda', 'Efe', 'Göktuğ', 'Burak', 'İlker', 'Onur', 'Tuna',
];

export const SURNAMES = [
  'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir',
  'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek',
  'Polat', 'Erdoğan', 'Güneş', 'Aksoy', 'Ekinci', 'Tekin', 'Bulut', 'Turan', 'Uçar', 'Karaca',
];

export const OCCUPATIONS = [
  'Mühendis', 'Öğretmen', 'Doktor', 'Avukat', 'Mimar', 'Esnaf', 'Muhasebeci', 'Hemşire',
  'Bankacı', 'Akademisyen', 'Serbest meslek', 'Eczacı',
];

export const DEMO_PASSWORD = 'Demo!Parola2026';

export interface DemoMember {
  email: string;
  fullName: string;
  roles: string[];
  title: string;
  /** Branch codes; empty + allBranches=true for organization-wide members. */
  branches: string[];
  allBranches?: boolean;
  /** Creates a personnel record linked to the membership (teachers). */
  personnel?: { branch: string; position: string; department: string };
}

export interface DemoClass {
  branch: string;
  grade: string;
  name: string;
  homeroomEmail?: string;
  subjectAssignments?: { email: string; subject: string }[];
}

export interface DemoOrganization {
  slug: string;
  name: string;
  legalName: string;
  seed: number;
  branches: { code: string; name: string; city: string; district: string }[];
  grades: { code: string; name: string; stage: 'middle' | 'high' }[];
  classes: DemoClass[];
  members: DemoMember[];
  /** Additional teachers without system access. */
  teachers: { branch: string; firstName: string; lastName: string; position: string }[];
  studentsPerClass: number;
  tuitionMinor: number;
}

export const DEMO_ORGANIZATIONS: DemoOrganization[] = [
  {
    slug: 'atlas',
    name: 'Atlas Akademi',
    legalName: 'Atlas Eğitim Hizmetleri A.Ş. (kurgusal)',
    seed: 20_260_901,
    branches: [
      { code: 'KDK', name: 'Kadıköy Kampüsü', city: 'İstanbul', district: 'Kadıköy' },
      { code: 'ATS', name: 'Ataşehir Kampüsü', city: 'İstanbul', district: 'Ataşehir' },
    ],
    grades: [
      { code: '9', name: '9. Sınıf', stage: 'high' },
      { code: '10', name: '10. Sınıf', stage: 'high' },
      { code: '11', name: '11. Sınıf', stage: 'high' },
      { code: '12', name: '12. Sınıf', stage: 'high' },
    ],
    classes: [
      {
        branch: 'KDK',
        grade: '9',
        name: '9-A',
        homeroomEmail: 'ogretmen@atlas.test',
        subjectAssignments: [{ email: 'ogretmen@atlas.test', subject: 'Matematik' }],
      },
      { branch: 'KDK', grade: '9', name: '9-B' },
      {
        branch: 'KDK',
        grade: '10',
        name: '10-A',
        subjectAssignments: [{ email: 'ogretmen@atlas.test', subject: 'Matematik' }],
      },
      { branch: 'ATS', grade: '9', name: '9-A' },
      { branch: 'ATS', grade: '11', name: '11-A' },
    ],
    members: [
      {
        email: 'sahip@atlas.test',
        fullName: 'Elif Aydın',
        roles: ['owner'],
        title: 'Kurucu Müdür',
        branches: [],
        allBranches: true,
      },
      {
        email: 'mudur@atlas.test',
        fullName: 'Murat Şahin',
        roles: ['principal'],
        title: 'Okul Müdürü',
        branches: [],
        allBranches: true,
      },
      {
        email: 'muhasebe@atlas.test',
        fullName: 'Zeynep Kaya',
        roles: ['accountant'],
        title: 'Muhasebe Uzmanı',
        branches: ['KDK'],
      },
      {
        email: 'ogretmen@atlas.test',
        fullName: 'Can Demir',
        roles: ['teacher'],
        title: 'Matematik Öğretmeni',
        branches: ['KDK'],
        personnel: { branch: 'KDK', position: 'Matematik Öğretmeni', department: 'Matematik' },
      },
      {
        email: 'ogrenciisleri@atlas.test',
        fullName: 'Ayşe Yıldız',
        roles: ['student_affairs'],
        title: 'Öğrenci İşleri Sorumlusu',
        branches: ['KDK', 'ATS'],
      },
      {
        email: 'subemuduru@atlas.test',
        fullName: 'Burak Öztürk',
        roles: ['branch_manager'],
        title: 'Ataşehir Kampüs Müdürü',
        branches: ['ATS'],
      },
      {
        email: 'danisman@campusos.test',
        fullName: 'Kerem Polat',
        roles: ['principal'],
        title: 'Eğitim Danışmanı',
        branches: [],
        allBranches: true,
      },
    ],
    teachers: [
      { branch: 'KDK', firstName: 'Selin', lastName: 'Çetin', position: 'Türk Dili ve Edebiyatı Öğretmeni' },
      { branch: 'KDK', firstName: 'Onur', lastName: 'Kurt', position: 'Fizik Öğretmeni' },
      { branch: 'ATS', firstName: 'Melis', lastName: 'Güneş', position: 'İngilizce Öğretmeni' },
    ],
    studentsPerClass: 8,
    tuitionMinor: 45_000_000,
  },
  {
    slug: 'nova',
    name: 'Nova Koleji',
    legalName: 'Nova Eğitim Kurumları Ltd. Şti. (kurgusal)',
    seed: 20_260_902,
    branches: [{ code: 'CNK', name: 'Çankaya Kampüsü', city: 'Ankara', district: 'Çankaya' }],
    grades: [
      { code: '7', name: '7. Sınıf', stage: 'middle' },
      { code: '8', name: '8. Sınıf', stage: 'middle' },
    ],
    classes: [
      {
        branch: 'CNK',
        grade: '7',
        name: '7-A',
        homeroomEmail: 'ogretmen@nova.test',
        subjectAssignments: [{ email: 'ogretmen@nova.test', subject: 'Fen Bilimleri' }],
      },
      { branch: 'CNK', grade: '8', name: '8-A' },
    ],
    members: [
      {
        email: 'sahip@nova.test',
        fullName: 'Selin Arslan',
        roles: ['owner'],
        title: 'Genel Müdür',
        branches: [],
        allBranches: true,
      },
      {
        email: 'muhasebe@nova.test',
        fullName: 'Emre Koç',
        roles: ['accountant'],
        title: 'Muhasebe Müdürü',
        branches: [],
        allBranches: true,
      },
      {
        email: 'ogretmen@nova.test',
        fullName: 'Deniz Aksoy',
        roles: ['teacher'],
        title: 'Fen Bilimleri Öğretmeni',
        branches: ['CNK'],
        personnel: { branch: 'CNK', position: 'Fen Bilimleri Öğretmeni', department: 'Fen' },
      },
      {
        email: 'danisman@campusos.test',
        fullName: 'Kerem Polat',
        roles: ['student_affairs'],
        title: 'Öğrenci İşleri Danışmanı',
        branches: ['CNK'],
      },
    ],
    teachers: [{ branch: 'CNK', firstName: 'Tuna', lastName: 'Bulut', position: 'Matematik Öğretmeni' }],
    studentsPerClass: 7,
    tuitionMinor: 32_000_000,
  },
];

export const PLATFORM_ADMIN = {
  email: 'platform@campusos.test',
  fullName: 'Platform Yöneticisi',
};
