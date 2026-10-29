// The career source library shown on the private Career page. Tiers: A = Dayweave can read it on its own (public, official,
// no sign-in); B = you save postings from it yourself (link or bookmarklet); C = it happens only in your own account
// (apps, chats, school systems), so Dayweave only keeps the record. No tier ever applies or sends anything.
export type Region = 'overseas' | 'china' | 'hksg';
export type Tier = 'A' | 'B' | 'C';
type Text = { en: string; zh: string };
export interface CareerSource { id: string; name: string; region: Region; tier: Tier; url: string; how: Text; planned?: boolean }

const t = (en: string, zh: string): Text => ({ en, zh });
const BOARD = t('Add the company to “Companies to watch”; new postings are read once a day.', '把公司加入「关注公司」，每天读取一次新职位。');
const SAVE = t('Save postings you want with the link; deadlines go into your plan.', '看到合适的职位用链接保存，截止日会进规划。');

export const SOURCES: CareerSource[] = [
  { id: 'greenhouse', name: 'Greenhouse', region: 'overseas', tier: 'A', url: 'https://boards.greenhouse.io', how: BOARD },
  { id: 'lever', name: 'Lever', region: 'overseas', tier: 'A', url: 'https://jobs.lever.co', how: BOARD },
  { id: 'ashby', name: 'Ashby', region: 'overseas', tier: 'A', url: 'https://jobs.ashbyhq.com', how: BOARD },
  { id: 'smartrecruiters', name: 'SmartRecruiters', region: 'overseas', tier: 'A', url: 'https://jobs.smartrecruiters.com', how: BOARD },
  { id: 'linkedin', name: 'LinkedIn Jobs', region: 'overseas', tier: 'B', url: 'https://www.linkedin.com/jobs/', how: t('Save postings yourself. Easy Apply, invitations and messages stay manual: LinkedIn forbids automation tools.', '职位自己保存。Easy Apply、加好友和私信只能手动：LinkedIn 禁止自动化工具。') },
  { id: 'workday', name: 'Workday company sites', region: 'overseas', tier: 'B', url: 'https://www.workday.com', how: t('No public job feed. Save the posting link and apply on the company site.', '没有公开职位接口。保存职位链接，在公司官网自己投递。') },
  { id: 'mbb', name: 'McKinsey · BCG · Bain', region: 'overseas', tier: 'B', url: 'https://www.mckinsey.com/careers', how: t('Consulting is your second track: add each firm’s application window as a job with its deadline.', '咨询是第二优先方向：把各家网申窗口作为职位加入并填截止日。') },
  { id: 'handshake', name: 'Handshake', region: 'overseas', tier: 'B', url: 'https://joinhandshake.com', how: SAVE },
  { id: 'wellfound', name: 'Wellfound', region: 'overseas', tier: 'B', url: 'https://wellfound.com/jobs', how: t('Start-ups, including AI companies. Many also use Greenhouse, Lever or Ashby: watch those boards instead when you can.', '初创公司（含 AI 公司）。很多也用 Greenhouse、Lever、Ashby，能关注这些就优先关注。') },
  { id: 'yale-cdo', name: 'Yale SOM Career Development', region: 'overseas', tier: 'C', url: 'https://som.yale.edu', how: t('School sign-in. Record school-only postings, recruiting events and coffee chats here by hand.', '需要学校登录。学校专属职位、招聘会和 coffee chat 手动记在这里。') },
  { id: 'h1b', name: 'USCIS H-1B Employer Data Hub', region: 'overseas', tier: 'A', url: 'https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub', planned: true, how: t('Public sponsorship records by employer; planned as visa-sponsorship evidence on US jobs.', '按雇主公开的签证担保记录；计划用作美国职位的担保证据。') },

  { id: 'bytedance', name: '字节跳动校招', region: 'china', tier: 'B', url: 'https://jobs.bytedance.com/campus', how: t('Campus site with its own account. Add the application window and written-test date as a job.', '有独立账号。把网申窗口和笔试日期作为职位加入。') },
  { id: 'tencent', name: '腾讯校招', region: 'china', tier: 'B', url: 'https://join.qq.com', how: t('Add the application window and test date as a job.', '把网申窗口和笔试日期作为职位加入。') },
  { id: 'alibaba', name: '阿里巴巴校招', region: 'china', tier: 'B', url: 'https://talent.alibaba.com', how: t('Add the application window and test date as a job.', '把网申窗口和笔试日期作为职位加入。') },
  { id: 'meituan', name: '美团校招', region: 'china', tier: 'B', url: 'https://campus.meituan.com', how: t('Add the application window and test date as a job.', '把网申窗口和笔试日期作为职位加入。') },
  { id: 'jd', name: '京东校招', region: 'china', tier: 'B', url: 'https://campus.jd.com', how: t('Add the application window and test date as a job.', '把网申窗口和笔试日期作为职位加入。') },
  { id: 'xiaohongshu', name: '小红书招聘', region: 'china', tier: 'B', url: 'https://job.xiaohongshu.com', how: t('Add the application window and test date as a job.', '把网申窗口和笔试日期作为职位加入。') },
  { id: 'boss', name: 'BOSS直聘', region: 'china', tier: 'C', url: 'https://www.zhipin.com', how: t('Greeting an HR in the app is the application. Do it yourself; record “contacted / CV sent / interview” here and get reply reminders.', '在 App 里打招呼就是投递，只能自己操作；这里记录「已沟通 / 已交简历 / 约面试」并提醒你回复。') },
  { id: 'liepin', name: '猎聘', region: 'china', tier: 'B', url: 'https://www.liepin.com', how: t('Headhunter channel: save postings, and add headhunters who contact you as contacts.', '猎头渠道：保存职位，联系你的猎头加为联系人。') },
  { id: 'zhaopin', name: '智联招聘', region: 'china', tier: 'B', url: 'https://www.zhaopin.com', how: SAVE },
  { id: '51job', name: '前程无忧', region: 'china', tier: 'B', url: 'https://www.51job.com', how: SAVE },
  { id: 'nowcoder', name: '牛客', region: 'china', tier: 'B', url: 'https://www.nowcoder.com', how: t('Campus calendar and interview notes: copy the dates you need into your jobs.', '校招日历和面经：把需要的日期抄到对应职位里。') },
  { id: 'yingjiesheng', name: '应届生求职网', region: 'china', tier: 'B', url: 'https://www.yingjiesheng.com', how: t('Campus application windows and deadlines: copy the dates you need into your jobs.', '网申开放和截止汇总：把需要的日期抄到对应职位里。') },
  { id: 'shixiseng', name: '实习僧', region: 'china', tier: 'B', url: 'https://www.shixiseng.com', how: SAVE },

  { id: 'jobsdb', name: 'JobsDB Hong Kong', region: 'hksg', tier: 'B', url: 'https://hk.jobsdb.com', how: SAVE },
  { id: 'ctgoodjobs', name: 'CTgoodjobs', region: 'hksg', tier: 'B', url: 'https://www.ctgoodjobs.hk', how: SAVE },
  { id: 'efinancial', name: 'eFinancialCareers', region: 'hksg', tier: 'B', url: 'https://www.efinancialcareers.com', how: SAVE },
  { id: 'mycareersfuture', name: 'MyCareersFuture (Singapore)', region: 'hksg', tier: 'A', url: 'https://www.mycareersfuture.gov.sg', planned: true, how: t('Singapore government job board with a public feed; planned for the daily read.', '新加坡政府职位库，有公开接口；计划加入每日读取。') },
];

/** Where each job board's short name sits in its public link, for the watch-list form. */
export const BOARD_HINT: Record<string, string> = {
  greenhouse: 'boards.greenhouse.io/<name>', lever: 'jobs.lever.co/<name>', ashby: 'jobs.ashbyhq.com/<name>', smartrecruiters: 'jobs.smartrecruiters.com/<name>',
};
