// Demo-only preview of two planned career features: job matching and networking suggestions. Everything here is
// fictional and written in advance, like the other AI outputs in the demo; no model or website is called. The private
// instance does not show this data. docs/roadmap.md says how real data would arrive.
export interface L { en: string; zh: string }
const l = (en: string, zh: string): L => ({ en, zh });

export type Dim = 'skills' | 'experience' | 'eligibility' | 'timing';
/** The rules weigh the four parts; the model only explains them. Weights add up to 1. */
export const WEIGHTS: Record<Dim, number> = { skills: 0.4, experience: 0.3, eligibility: 0.2, timing: 0.1 };
export const matchScore = (dims: Record<Dim, number>) => Math.round((Object.keys(WEIGHTS) as Dim[]).reduce((n, k) => n + WEIGHTS[k] * dims[k], 0));

export type Met = 'yes' | 'partial' | 'no' | 'unknown';
export interface Requirement { text: L; met: Met; evidence: L }
export interface Suggestion { title: L; why: L; before?: string; after: string }

export interface PreviewRole {
  id: string; title: string; company: string; location: string; posted: number; sponsorship: 'yes' | 'unknown' | 'no'; startYear: number | null;
  summary: L; dims: Record<Dim, number>; dimNotes: Record<Dim, L>;
  requirements: Requirement[]; suggestions: Suggestion[]; contactId?: string;
}

export type Link = 'same' | 'near' | 'none';
export interface PathRow { yours: L; theirs: L; link: Link; note?: L }
export interface Draft { kind: 'connect' | 'coffee' | 'referral' | 'thanks'; text: string }

export interface PreviewPerson {
  id: string; name: string; headline: string; degree: 2 | 3; mutuals: number; location: string;
  summary: L; why: L; shared: L[]; path: PathRow[]; drafts: Draft[]; roleId?: string;
}

/** Luna's fictional profile, the "resume" every match is checked against. */
export const PROFILE = {
  name: 'Luna Park (fictional)',
  lines: [
    l('MS in Management Science, 2027 (second year)', '管理科学硕士，2027 届（二年级）'),
    l('Product intern, Quillboard (fictional edtech), summer 2025', '产品实习，Quillboard（虚构教育科技），2025 年夏'),
    l('Data analyst intern, Brightcart (fictional retail), 2024', '数据分析实习，Brightcart（虚构零售），2024 年'),
    l('Side project: a study planner with an LLM evaluation set', '个人项目：带 LLM 评测集的学习计划工具'),
    l('Needs US visa sponsorship', '需要美国工作签证赞助'),
  ],
};

export const ROLES: PreviewRole[] = [
  {
    id: 'pv-ledgerly-apm', title: 'Associate Product Manager, 2027', company: 'Ledgerly (fictional fintech)', location: 'New York', posted: 2, sponsorship: 'yes', startYear: 2027,
    summary: l('Rotational APM program for 2027 graduates; payments and onboarding teams.', '面向 2027 届的轮岗 APM 项目，支付和开户团队。'),
    dims: { skills: 88, experience: 80, eligibility: 100, timing: 90 },
    dimNotes: {
      skills: l('PRD writing, A/B testing and SQL all have evidence; financial domain is thin.', 'PRD、A/B 测试、SQL 都有依据；金融领域经验较少。'),
      experience: l('Two internships, one in product. The program expects one.', '两段实习，其中一段是产品岗。项目要求一段即可。'),
      eligibility: l('Posting says sponsorship is available for this program.', '职位写明该项目提供签证赞助。'),
      timing: l('2027 start matches graduation. Applications close in 3 weeks.', '2027 年入职与毕业时间吻合。3 周后截止申请。'),
    },
    requirements: [
      { text: l('Graduating between Dec 2026 and Jun 2027', '2026 年 12 月至 2027 年 6 月间毕业'), met: 'yes', evidence: l('MS, 2027', '硕士，2027 届') },
      { text: l('Wrote product specs or PRDs', '写过产品需求文档'), met: 'yes', evidence: l('PROD 540: Campus Eats PRD; Quillboard internship', 'PROD 540 课程的 Campus Eats PRD；Quillboard 实习') },
      { text: l('Comfortable with SQL and experiment analysis', '熟悉 SQL 和实验分析'), met: 'yes', evidence: l('Brightcart: weekly A/B readouts in SQL', 'Brightcart：每周用 SQL 做 A/B 测试复盘') },
      { text: l('Interest in payments or financial products', '对支付或金融产品有兴趣'), met: 'partial', evidence: l('Only coursework (ECON 512 platform pricing)', '只有课程经历（ECON 512 平台定价）') },
      { text: l('Shipped a feature end to end', '完整上线过一个功能'), met: 'partial', evidence: l('Quillboard feature reached beta, not general release', 'Quillboard 的功能只到了内测') },
    ],
    suggestions: [
      { title: l('Lead with the shipped outcome', '先写上线结果'), why: l('The posting asks for end-to-end ownership; the current line describes tasks, not a result.', '职位看重端到端负责；现在这句写的是任务，不是结果。'),
        before: 'Worked on onboarding flow redesign with engineers and designers.', after: 'Led onboarding redesign from PRD to beta with 2 engineers; cut setup time 38% for 1,200 beta teachers.' },
      { title: l('Name the payments angle', '点明和支付的关联'), why: l('Domain interest is the weakest requirement. One line connecting ECON 512 pricing work to payments closes most of it.', '领域兴趣是最弱的一项。用一句话把 ECON 512 的定价作业和支付联系起来即可。'),
        after: 'Modeled take-rate trade-offs for a two-sided marketplace (ECON 512); proposed fee tiers adopted in class case.' },
      { title: l('Talk to Maya before applying', '投递前先联系 Maya'), why: l('A second-degree alumna is a PM on this team. A referral usually moves an APM application further than a resume edit.', '一位二度校友就在这个团队做 PM。对 APM 申请来说，内推通常比改简历更有用。'),
        after: 'See the People panel: Maya Rivera.' },
    ],
    contactId: 'pv-maya',
  },
  {
    id: 'pv-cortexa-aipm', title: 'Product Manager, AI Tools (New Grad)', company: 'Cortexa (fictional AI startup)', location: 'San Francisco', posted: 5, sponsorship: 'yes', startYear: 2027,
    summary: l('First PM hire for an LLM evaluation product; works directly with the founders.', '一家做 LLM 评测产品的初创公司的首位 PM，直接和创始人合作。'),
    dims: { skills: 84, experience: 70, eligibility: 100, timing: 80 },
    dimNotes: {
      skills: l('The LLM eval side project matches the product almost exactly.', 'LLM 评测个人项目和这个产品几乎完全对口。'),
      experience: l('No full-time PM role yet; startup expects some ambiguity tolerance.', '还没有全职 PM 经历；初创公司看重应对模糊的能力。'),
      eligibility: l('Sponsorship listed; New Grad title fits.', '写明提供赞助；应届岗位符合。'),
      timing: l('Rolling start in 2027; posting is new.', '2027 年滚动入职；职位刚发布。'),
    },
    requirements: [
      { text: l('Built or evaluated an LLM-based product', '做过或评测过基于 LLM 的产品'), met: 'yes', evidence: l('Study planner side project with a 40-case eval set', '学习计划个人项目，含 40 个评测用例') },
      { text: l('Can read Python and talk to ML engineers', '能读 Python，能和机器学习工程师沟通'), met: 'yes', evidence: l('Python in STAT 610 and the side project', 'STAT 610 和个人项目中使用 Python') },
      { text: l('Customer discovery with technical buyers', '面向技术型客户做过需求调研'), met: 'no', evidence: l('Interviews so far were with students and teachers', '目前访谈对象都是学生和老师') },
      { text: l('Comfortable in a team under 20 people', '适应 20 人以下的团队'), met: 'unknown', evidence: l('Not stated anywhere in the profile', '资料中没有提到') },
    ],
    suggestions: [
      { title: l('Move the side project to the top', '把个人项目放到最前'), why: l('It is the strongest match for this role, but it sits last on the resume.', '它是和这个职位最匹配的经历，但在简历最后一行。'),
        after: 'Built an AI study planner whose outputs are checked against their sources; wrote a 40-case eval set and cut ungrounded answers from 12% to 2%.' },
      { title: l('Add one technical-buyer interview', '补一次技术型客户访谈'), why: l('The only missing requirement. Three 20-minute interviews with ML engineers would give a real line to cite.', '唯一缺的一项。和三位机器学习工程师各聊 20 分钟，就有一句可以写进简历。'),
        after: 'Interviewed 3 ML engineers on eval workflows; mapped 4 pain points into a prioritized backlog.' },
    ],
    contactId: 'pv-ines',
  },
  {
    id: 'pv-stallside-analyst', title: 'Product Analyst', company: 'Stallside (fictional marketplace)', location: 'New York', posted: 9, sponsorship: 'unknown', startYear: 2027,
    summary: l('Analyst on the buyer-trust team; causal inference on marketplace experiments.', '买家信任团队的分析师；对平台实验做因果推断。'),
    dims: { skills: 92, experience: 78, eligibility: 40, timing: 85 },
    dimNotes: {
      skills: l('Causal inference coursework and A/B work match closely.', '因果推断课程和 A/B 测试经验高度匹配。'),
      experience: l('The 2024 analyst internship is the right shape.', '2024 年的分析实习方向正确。'),
      eligibility: l('The posting does not mention sponsorship, so this stays unknown and scores low.', '职位没提签证赞助，所以记为未知并降低分数。'),
      timing: l('2027 start; posted 9 days ago.', '2027 年入职；9 天前发布。'),
    },
    requirements: [
      { text: l('Experiment design and causal inference', '实验设计与因果推断'), met: 'yes', evidence: l('STAT 610; Brightcart A/B readouts', 'STAT 610；Brightcart 的 A/B 复盘') },
      { text: l('Advanced SQL', '熟练 SQL'), met: 'yes', evidence: l('Brightcart internship', 'Brightcart 实习') },
      { text: l('US work authorization', '美国工作许可'), met: 'unknown', evidence: l('Sponsorship not mentioned; ask the recruiter or Omar', '没写是否赞助；可问招聘方或 Omar') },
    ],
    suggestions: [
      { title: l('Ask about sponsorship first', '先确认签证赞助'), why: l('The match is high, but an unknown hard requirement can end it. Ask before spending time on a tailored resume.', '匹配度高，但硬性条件未知可能直接出局。先问清楚再花时间改简历。'),
        after: 'Ask Omar Haddad (People panel) whether the analyst team has sponsored before.' },
    ],
    contactId: 'pv-omar',
  },
  {
    id: 'pv-carewell-intern', title: 'PM Intern, Summer', company: 'Carewell (fictional health-tech)', location: 'Boston', posted: 14, sponsorship: 'unknown', startYear: null,
    summary: l('Twelve-week internship on the patient scheduling app.', '为期 12 周的实习，负责患者预约应用。'),
    dims: { skills: 70, experience: 75, eligibility: 40, timing: 20 },
    dimNotes: {
      skills: l('Scheduling and planning work is relevant; no health-care background.', '排程类经验相关；没有医疗背景。'),
      experience: l('Fits an intern profile.', '符合实习生要求。'),
      eligibility: l('Sponsorship not stated for interns.', '没写实习是否支持签证。'),
      timing: l('A summer internship after graduation may not be useful; start year is not stated.', '毕业后的暑期实习意义不大；也没写哪一年。'),
    },
    requirements: [
      { text: l('Currently enrolled student', '在读学生'), met: 'yes', evidence: l('MS, 2027', '硕士，2027 届') },
      { text: l('Health-care interest', '对医疗领域有兴趣'), met: 'no', evidence: l('Nothing in the profile', '资料中没有') },
      { text: l('Start year', '入职年份'), met: 'unknown', evidence: l('Posting does not say which summer', '职位没写是哪一年夏天') },
    ],
    suggestions: [
      { title: l('Probably skip', '建议跳过'), why: l('Low timing score: Luna graduates before the next summer internship would start. Dismiss it unless it is for summer 2026.', '时间分很低：下一次暑期实习开始前 Luna 已经毕业。除非是 2026 年夏天，否则可以忽略。'),
        after: 'Dismiss, or check the start year with the recruiter.' },
    ],
  },
];

export const PEOPLE: PreviewPerson[] = [
  {
    id: 'pv-maya', name: 'Maya Rivera (fictional)', headline: 'Product Manager, Payments · Ledgerly', degree: 2, mutuals: 4, location: 'New York', roleId: 'pv-ledgerly-apm',
    summary: l('Same MS program, class of 2023. Started as an analyst, joined Ledgerly through its APM program, now a PM on payments.', '同一硕士项目 2023 届。分析师出身，通过 Ledgerly 的 APM 项目入职，现在做支付方向 PM。'),
    why: l('She took the exact path Luna is applying for, on the team that posted the APM role two days ago.', '她走的正是 Luna 在申请的路线，而且就在两天前发布 APM 职位的团队。'),
    shared: [l('Same MS program', '同一硕士项目'), l('Analyst → PM', '分析转产品'), l('New York', '纽约'), l('4 mutual connections', '4 位共同好友')],
    path: [
      { yours: l('MS Management Science, 2027', '管理科学硕士，2027'), theirs: l('MS Management Science, 2023', '管理科学硕士，2023'), link: 'same', note: l('Same program, four years apart', '同一项目，相隔四届') },
      { yours: l('Data analyst intern, Brightcart', '数据分析实习，Brightcart'), theirs: l('Analyst, Northpoint Bank', '分析师，Northpoint 银行'), link: 'near', note: l('Both started in analytics', '都从数据分析起步') },
      { yours: l('Product intern, Quillboard', '产品实习，Quillboard'), theirs: l('APM program, Ledgerly', 'APM 项目，Ledgerly'), link: 'near', note: l('Her next step is the role Luna wants', '她的下一步正是 Luna 想要的职位') },
      { yours: l('Target: New York', '目标城市：纽约'), theirs: l('Based in New York', '常驻纽约'), link: 'same' },
    ],
    drafts: [
      { kind: 'connect', text: 'Hi Maya, I’m Luna, a second-year in the MS program you finished in 2023. I’m applying to Ledgerly’s 2027 APM program and would love to hear how you made the move from analyst to PM. Thanks!' },
      { kind: 'coffee', text: 'Hi Maya,\n\nI’m Luna, a second-year in our MS program. Like you, I started in analytics (a data internship at Brightcart) before moving into product at Quillboard. I saw Ledgerly just opened its 2027 APM program and I’m preparing my application.\n\nWould you have 20 minutes in the next two weeks for a quick call? I’d love to hear what made the APM program a good fit for you and what the payments team looks for.\n\nThank you,\nLuna' },
      { kind: 'referral', text: 'Hi Maya, thank you again for the chat last week. It made me even more excited about the payments team. I’ve submitted my application for the 2027 APM program (job ID in the link below). If you feel comfortable, would you be willing to refer me? I’ve attached my resume and a three-line summary you can paste. No pressure at all if not.' },
    ],
  },
  {
    id: 'pv-omar', name: 'Omar Haddad (fictional)', headline: 'Product Manager, Buyer Trust · Stallside', degree: 2, mutuals: 2, location: 'New York', roleId: 'pv-stallside-analyst',
    summary: l('Data scientist turned PM. Worked at Brightcart before Luna’s internship there, now leads buyer trust at Stallside.', '数据科学家转产品。比 Luna 更早在 Brightcart 工作过，现在负责 Stallside 的买家信任。'),
    why: l('He can answer the one unknown on the Stallside analyst role: whether the team sponsors visas.', '他能回答 Stallside 分析岗唯一的未知项：团队是否提供签证赞助。'),
    shared: [l('Both at Brightcart', '都在 Brightcart 工作过'), l('Data → product', '数据转产品'), l('2 mutual connections', '2 位共同好友')],
    path: [
      { yours: l('Data analyst intern, Brightcart, 2024', '数据分析实习，Brightcart，2024'), theirs: l('Data scientist, Brightcart, 2018–2021', '数据科学家，Brightcart，2018–2021'), link: 'same', note: l('Same company, same analytics team', '同一公司，同一分析团队') },
      { yours: l('STAT 610 causal inference', 'STAT 610 因果推断'), theirs: l('Marketplace experimentation lead', '平台实验负责人'), link: 'near' },
      { yours: l('Target: Product Analyst, Stallside', '目标：Stallside 产品分析师'), theirs: l('PM, Stallside', 'Stallside 产品经理'), link: 'near', note: l('The analyst team reports into his group', '分析团队归他的组管') },
    ],
    drafts: [
      { kind: 'connect', text: 'Hi Omar, I’m Luna, a grad student who interned on Brightcart’s analytics team in 2024 (I heard your experiment playbook was still in use!). I’m looking at Stallside’s product analyst role and would value 2 minutes of your advice.' },
      { kind: 'coffee', text: 'Hi Omar,\n\nI interned on Brightcart’s analytics team in 2024 and still used the experiment templates your team left behind. I’m now finishing an MS and applying to Stallside’s Product Analyst role on buyer trust.\n\nOne practical question: has the analyst team sponsored work visas for new grads before? I’d also love 15 minutes to hear how you moved from data science to PM.\n\nThanks,\nLuna' },
      { kind: 'referral', text: 'Hi Omar, thanks for confirming the sponsorship question. It helped a lot. I’ve applied to the Product Analyst role (link below). If you think I’d be a fit, would you be open to referring me? I’m happy to send a short summary to make it easy.' },
    ],
  },
  {
    id: 'pv-ines', name: 'Ines Moreau (fictional)', headline: 'Head of Product · Cortexa', degree: 3, mutuals: 0, location: 'San Francisco', roleId: 'pv-cortexa-aipm',
    summary: l('Spoke at the program’s AI speaker series last month about evaluating LLM products. Hiring Cortexa’s first new-grad PM.', '上个月在项目的 AI 讲座上分享过 LLM 产品评测。正在招 Cortexa 的第一位应届 PM。'),
    why: l('No mutual connections, but a strong shared topic: Luna’s side project is an LLM eval set, which is Cortexa’s product.', '没有共同好友，但共同话题很强：Luna 的个人项目就是 LLM 评测集，正是 Cortexa 的产品。'),
    shared: [l('Attended her talk', '听过她的讲座'), l('Both build LLM evals', '都在做 LLM 评测'), l('No mutuals: cold message', '无共同好友：冷启动')],
    path: [
      { yours: l('Side project: LLM eval set (40 cases)', '个人项目：LLM 评测集（40 个用例）'), theirs: l('Cortexa: LLM evaluation platform', 'Cortexa：LLM 评测平台'), link: 'same', note: l('Same problem space', '同一个问题领域') },
      { yours: l('Attended AI speaker series, Oct 2026', '参加 AI 讲座，2026 年 10 月'), theirs: l('Speaker, AI speaker series, Oct 2026', '讲者，AI 讲座，2026 年 10 月'), link: 'same' },
      { yours: l('Based in New York', '常驻纽约'), theirs: l('Based in San Francisco', '常驻旧金山'), link: 'none', note: l('Different city; the role is on-site', '城市不同；岗位需到岗') },
    ],
    drafts: [
      { kind: 'connect', text: 'Hi Ines, I loved your talk at our AI speaker series, especially the point about grading evals against sources. I built a small 40-case eval for my own LLM planner and would love to share what I learned.' },
      { kind: 'coffee', text: 'Hi Ines,\n\nThank you for your talk at our AI speaker series. Your point that an eval should check grounding, not just tone, changed how I scored my own side project: an AI study planner with a 40-case eval set. Ungrounded answers went from 12% to 2% after I rewrote the checker.\n\nI saw Cortexa is hiring its first new-grad PM. Would you be open to a 15-minute call? I’d be glad to walk you through the eval in return.\n\nBest,\nLuna' },
      { kind: 'referral', text: 'Hi Ines, thanks for the call. I’ve applied for the New Grad PM role and attached the one-page write-up of my eval project we discussed. If it’s appropriate, I’d be grateful if you could pass it to the hiring team.' },
    ],
  },
];

/** LinkedIn limits a connection note to 300 characters. */
export const CONNECT_LIMIT = 300;

// ---- Pipeline, interview prep and follow-up rhythm (second preview) ----

export const STAGES = ['none', 'saved', 'applied', 'interview', 'offer', 'closed'] as const;
export type Stage = (typeof STAGES)[number];
/** An application with no reply this many days after it went out gets a follow-up nudge. */
export const STALE_DAYS = 10;

export interface PipelineItem {
  id: string; title: string; company: string; stage: Stage;
  /** Days before today; the visitor's own stage changes replace these with real dates. */
  appliedDaysAgo?: number; heardDaysAgo?: number; contactId?: string; note?: L;
}

/** Where Luna's search stands when the demo opens. The four preview roles keep their ids, so both tabs share one status. */
export const PIPELINE_SEED: PipelineItem[] = [
  { id: 'pv-ledgerly-apm', title: 'Associate Product Manager, 2027', company: 'Ledgerly', stage: 'interview', appliedDaysAgo: 6, heardDaysAgo: 1, contactId: 'pv-maya',
    note: l('Recruiter asked for screening times', '招聘方在约初筛时间') },
  { id: 'pv-cortexa-aipm', title: 'Product Manager, AI Tools (New Grad)', company: 'Cortexa', stage: 'saved', contactId: 'pv-ines' },
  { id: 'pv-stallside-analyst', title: 'Product Analyst', company: 'Stallside', stage: 'applied', appliedDaysAgo: 12, contactId: 'pv-omar' },
  { id: 'pv-northwind-dpm', title: 'Data Product Manager', company: 'Northwind (fictional)', stage: 'applied', appliedDaysAgo: 3 },
  { id: 'pv-carewell-intern', title: 'PM Intern, Summer', company: 'Carewell', stage: 'none' },
  { id: 'pv-tandem-growth', title: 'Growth PM, New Grad', company: 'Tandem (fictional)', stage: 'closed', appliedDaysAgo: 19, heardDaysAgo: 8,
    note: l('Not moving forward; asked for feedback', '未进入下一轮；已请求反馈') },
];

export const REL_STAGES = ['none', 'requested', 'connected', 'chatted', 'referred'] as const;
export type RelStage = (typeof REL_STAGES)[number];
/** A connection request with no answer, or a chat with no next step, is followed up after this many days. */
export const FOLLOW_UP_DAYS = 7;
export const PEOPLE_SEED: Record<string, { stage: RelStage; daysAgo?: number }> = {
  'pv-maya': { stage: 'chatted', daysAgo: 2 },
  'pv-omar': { stage: 'requested', daysAgo: 8 },
  'pv-ines': { stage: 'none' },
};
export const THANKS: Record<string, string> = {
  'pv-maya': 'Hi Maya, thank you for making time to chat. Your advice to lead with the onboarding result, not the process, was exactly what my resume needed, and I’ve already rewritten that line. I’ll let you know how the Ledgerly screen goes. Thanks again!',
  'pv-omar': 'Hi Omar, thanks for the quick call and for checking on sponsorship with the analyst team. Good to know Brightcart’s experiment templates live on! I’ll apply this week and keep you posted.',
  'pv-ines': 'Hi Ines, thank you for the call. Your point about testing grounding before tone is going straight into my eval write-up. I’ll send it over once it’s cleaned up.',
};

export interface PrepQuestion { q: L; from: L; story: string[]; quote: string }
/** A prep pack for the interview email in the demo: questions from the posting, answers built only from the resume. */
export const PREP = {
  roleId: 'pv-ledgerly-apm', emailId: 'msg-recruiter',
  format: l('30-minute recruiter screen, then a product sense round. Interview time not set yet.', '30 分钟招聘方初筛，之后是产品感面试。时间还没定。'),
  company: [
    l('Ledgerly sells payments and onboarding to small businesses; the APM program rotates through both teams.', 'Ledgerly 面向小企业做支付和开户；APM 项目在这两个团队之间轮岗。'),
    l('The posting stresses end-to-end ownership and experiment-driven decisions.', '职位描述强调端到端负责和用实验做决策。'),
    l('Maya (People tab) said screens focus on one shipped story and “why payments”.', 'Maya（人脉标签）说初筛重点问一个上线经历和“为什么做支付”。'),
  ],
  questions: [
    { q: l('Tell me about a feature you took from idea to launch.', '讲一个你从想法做到上线的功能。'), from: l('Requirement: shipped a feature end to end (partly met)', '来自要求：完整上线过一个功能（部分满足）'),
      story: ['S: Teachers at Quillboard dropped off during setup.', 'T: Own the onboarding redesign as the product intern.', 'A: Wrote the PRD, ran 6 teacher interviews, cut setup to three steps with 2 engineers.', 'R: Beta with 1,200 teachers; setup time down 38%. Say plainly that it stopped at beta.'],
      quote: 'Led onboarding redesign from PRD to beta with 2 engineers; cut setup time 38% for 1,200 beta teachers.' },
    { q: l('How do you know an A/B test result is real?', '你怎么判断一个 A/B 测试结果是真的？'), from: l('Requirement: SQL and experiment analysis (met)', '来自要求：SQL 和实验分析（满足）'),
      story: ['S: Brightcart ran weekly checkout tests.', 'T: Produce the readout each week.', 'A: Checked sample-ratio mismatch, pre-registered the metric, held tests for full weeks.', 'R: Caught one false win from a holiday spike before it shipped.'],
      quote: 'Brightcart: weekly A/B readouts in SQL' },
    { q: l('Walk me through a PRD you wrote.', '带我过一遍你写的一份 PRD。'), from: l('Requirement: wrote product specs (met)', '来自要求：写过产品需求文档（满足）'),
      story: ['S: PROD 540 Campus Eats project.', 'T: Define the first release for late-night food ordering.', 'A: Framed the problem from 5 interviews, set one success metric, listed non-goals.', 'R: Use it to show trade-offs, not just structure.'],
      quote: 'PROD 540: Campus Eats PRD' },
    { q: l('Why payments, and why Ledgerly?', '为什么做支付，为什么是 Ledgerly？'), from: l('Requirement: interest in financial products (partly met)', '来自要求：对金融产品有兴趣（部分满足）'),
      story: ['S: ECON 512 marketplace pricing work.', 'T: Model take-rate trade-offs for a two-sided platform.', 'A: Built fee tiers and tested them against seller churn.', 'R: Tie it to small-business payments: fees are the product decision sellers feel most.'],
      quote: 'Modeled take-rate trade-offs for a two-sided marketplace (ECON 512)' },
    { q: l('Tell me about a time you disagreed with an engineer.', '讲一次你和工程师意见不同的经历。'), from: l('Behavioral; common in APM screens', '行为题；APM 初筛常见'),
      story: ['S: Quillboard engineers wanted to delay the beta for a full settings page.', 'T: Keep the launch date without losing trust.', 'A: Showed interview evidence that 4 of 6 teachers never opened settings; agreed to ship it a sprint later.', 'R: Beta on time; settings shipped two weeks after.'],
      quote: 'Product intern, Quillboard (fictional edtech), summer 2025' },
  ] as PrepQuestion[],
  ask: [
    l('What does a strong first rotation look like for an APM here?', '在这里，APM 第一段轮岗做得好是什么样子？'),
    l('How do the payments and onboarding teams decide what to test?', '支付和开户团队怎么决定测试什么？'),
    l('What did the last APM class find hardest in their first 90 days?', '上一届 APM 入职前 90 天觉得最难的是什么？'),
  ],
};
