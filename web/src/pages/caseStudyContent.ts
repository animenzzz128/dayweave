// Case study text, in both languages. Numbers here must stay true: update them when the facts change.
export interface Decision { title: string; chose: string; gaveUp: string; why: string }
export interface CaseStudyText {
  eyebrow: string; title: string; lede: string; role: string;
  toc: string;
  stats: [string, string][];
  try: { title: string; today: string; outage: string; review: string; repo: string };
  problem: { title: string; body: string[] };
  users: { title: string; body: string; jobs: string[] };
  principles: { title: string; items: [string, string][] };
  decisions: { title: string; intro: string; chose: string; gaveUp: string; why: string; items: Decision[] };
  ai: {
    title: string; body: string[]; features: [string, string][];
    resultsTitle: string; resultsIntro: string; head: [string, string, string]; tasks: Record<'brief' | 'breakdown' | 'propose', [string, string]>;
    meta: (model: string, day: string, runs: number, cost: number) => string; pending: string;
    failuresTitle: string; failuresNote: string; noFailures: string; limits: string;
    rescored: (first: string, now: string) => string; scorerFixed: string; lessons: string[];
    visitorTitle: string; visitorEmpty: string; visitor: (accepted: number, edited: number, ignored: number, edits: number) => string;
  };
  evals: { title: string; body: string[]; metricsTitle: string; metrics: [string, string, string][]; metricHead: [string, string, string] };
  roadmap: { title: string; items: [string, string, string][] };
  closing: string;
}

const en: CaseStudyText = {
  eyebrow: 'Case study',
  title: 'Dayweave: a planner that shows its work',
  lede: 'An AI daily planner for graduate students, designed around one question: can you trust today’s plan? Every recommendation links to its source, every failure stays visible, and nothing reaches your calendar until you approve an exact version.',
  role: 'Solo project: product, design and engineering, built with AI coding agents.',
  toc: 'On this page',
  stats: [['7', 'views in the demo'], ['196', 'automated tests'], ['5', 'checks before any approval'], ['0', 'calendar writes without your approval']],
  try: { title: 'Try it in two minutes', today: 'Open Luna’s day', outage: 'Simulate an outage', review: 'Review an AI proposal', repo: 'Source on GitHub' },
  problem: {
    title: 'The problem',
    body: [
      'A graduate student’s obligations are spread across learning platforms, course websites, a calendar and an inbox. The hard part is not listing them. It is knowing which ones are required, which are optional, which were already submitted, and how much free time is really free.',
      'General AI assistants are good at summarising that mess and confidently wrong about the details. In an early trial, a model counted an assignment due one minute after the 72-hour window as urgent, treated a group submission it could not see as overdue, and quietly dropped a course site that had failed to load. Each mistake looks small; together they make a plan you cannot act on.',
    ],
  },
  users: {
    title: 'Who it is for',
    body: 'The first user was me: a graduate student balancing three or four courses, group projects and recruiting. The demo uses Luna, a fictional student with the same shape of week. The jobs to be done:',
    jobs: ['Tell me what must happen today, and why.', 'Show me where each fact came from and how fresh it is.', 'Find focus time without double-booking me, and let me decide.'],
  },
  principles: {
    title: 'Product principles',
    items: [
      ['Source, suggestion and decision look different', 'What a source says, what the AI suggests and what you decide sit in separate columns. A suggestion is never presented as a fact.'],
      ['Failures stay visible, never zero', 'A source that fails keeps its last good records, marked for verification. Blank calendar time is “unknown”, not “free”. Try the outage switch to see it.'],
      ['Deterministic where correctness matters', 'Deadlines, requirement status and scheduling run in tested code. Language models write the brief, where wording helps and errors are cheap.'],
      ['Approve an exact, frozen version', 'Editing a proposal creates a new version and clears earlier approvals, so you always approve what will actually be written.'],
    ],
  },
  decisions: {
    title: 'Key decisions and trade-offs',
    intro: 'The most useful product work was deciding what not to automate.',
    chose: 'Chose', gaveUp: 'Gave up', why: 'Why',
    items: [
      { title: 'Outlook executor: no-go', chose: 'Read-only Google Calendar and Gmail snapshots, with writes approved in chat.', gaveUp: 'The school Outlook calendar, and remote, unattended writing.', why: 'The connector could not establish an authorised session, and nothing proved that an approval would reach a writer reliably. Shipping it would have meant writes nobody could verify.' },
      { title: 'No autonomous executor', chose: 'An approval names an exact version. The assistant rechecks the live calendar, writes once and reads the event back.', gaveUp: 'One-click “apply all” and background syncing.', why: 'A planner that writes silently loses trust after the first wrong event. One extra step per change was the price of being correctable.' },
      { title: 'A deterministic planner', chose: 'Rules in code: 09:00–24:00, blocks of 90 minutes or less, rest gaps, 20% left free, explicit durations only.', gaveUp: 'Plans that “feel” smarter but cannot be reproduced.', why: 'After the early trial, classification and scheduling moved into tested code. The planner refuses to plan on incomplete calendar coverage and says why.' },
      { title: 'AI explains, rules decide', chose: 'Rules pick priorities and check every block; the model explains, breaks down and parses, and each output is validated against its evidence.', gaveUp: 'Letting the model choose priorities or write proposals straight into the plan.', why: 'Wording is where a model helps and mistakes are cheap. Deadlines, requirements and conflicts are where mistakes cost trust, so they stay in tested code.' },
      { title: 'A static public demo first', chose: 'Fictional data in the browser, published by GitHub Pages, with AI outputs written in advance.', gaveUp: 'Live accounts and live model calls in the demo.', why: 'Anyone can try the full flow safely and for free. Real data waits for a private, signed-in instance.' },
    ],
  },
  ai: {
    title: 'In-product AI, checked against its evidence',
    body: [
      'The AI in Dayweave never decides what matters. The rules pick today’s priorities, check conflicts and guard the calendar; the model explains those choices, breaks an assignment into steps, or turns one sentence into a proposed block. Every output is checked against the records it was given before anyone sees it, and an output that fails is replaced by rule-written text that says why.',
      'The public demo makes no live model calls. Outputs were generated offline with the Claude API from Luna’s fictional data, and this browser re-runs the same checks before showing each one. Try the outage switch: the stored brief no longer matches the evidence, so the rules take over and the page says so.',
    ],
    features: [
      ['Cited daily brief', 'Every sentence carries numbered citations that open the underlying record inside the app.'],
      ['Assignment steps', 'Each step quotes the assignment text. Accept, edit first, or ignore; the choice is recorded.'],
      ['One-line proposals', 'A parsed sentence goes through the same conflict and coverage checks, and only into the review queue.'],
    ],
    resultsTitle: 'Model evaluation',
    resultsIntro: 'Each case changes Luna’s data (an outage, a moved deadline, an instruction hidden in an email) and scores the model’s first attempt with the site’s validator plus the case’s own expectations.',
    head: ['Task', 'Passed', 'What a pass requires'],
    tasks: {
      brief: ['Daily brief', 'Cites the right records, uses only their numbers and times, names every failed source, never claims an action.'],
      breakdown: ['Assignment steps', 'Quotes the assignment, keeps a sensible total, never hands submitted work to AI or follows an injected note.'],
      propose: ['One-line proposals', 'Right status (propose, ask or decline), right day, time and length; the rules block real conflicts.'],
    },
    meta: (model, day, runs, cost) => `${model}, run on ${day}, ${runs} run${runs > 1 ? 's' : ''} per case, about US$${cost} in total.`,
    pending: 'The model evaluation has not been run yet.',
    failuresTitle: 'Failures, as recorded',
    failuresNote: 'Taken from the result file. Each one is a case the validator or an expectation caught.',
    noFailures: 'No case failed in this run.',
    rescored: (first, now) => `First score ${first}. After fixing a bug in my own scorer and re-scoring the same stored outputs (no new model calls): ${now}. Both are kept in the result file.`,
    scorerFixed: 'Rejected by the scorer’s bug, accepted after the fix',
    lessons: [
      'Two failures were the model’s: one sentence ran to 329 characters, past the length limit, and one parsed “two hours on stats tomorrow” into a block that cited no assignment. The limit and the citation rule stay; they are what keep the brief short and every block traceable.',
      'Three failures were mine. The validator removed only the first negation in a sentence and did not know “optional rather than required”, “whether … has already been submitted” or 不是必须, so it rejected correct text. The eval caught the checker, not just the model. I fixed it, added those exact sentences as tests, and re-scored.',
    ],
    limits: 'Limits: one fictional student and a few dozen runs is a regression set, not proof of reliability on real data. Passing the checks means an output is grounded in its evidence, not that it is the best wording.',
    visitorTitle: 'Your own numbers in this demo',
    visitorEmpty: 'Open an assignment in Coursework and accept, edit or ignore the AI steps. Your choices are counted here, in this browser only.',
    visitor: (a, e, i, edits) => `You accepted ${a} suggestion${a === 1 ? '' : 's'} as written, accepted ${e} after editing (${edits} step change${edits === 1 ? '' : 's'}), and ignored ${i}. Nothing is uploaded.`,
  },
  evals: {
    title: 'Evals and metrics',
    body: [
      'Correctness is guarded at two levels. 196 automated tests cover the rules, the server and the real browser scripts in page order. A Luna evaluation set for the in-product AI is described above, and a smaller one checks the assistant’s collection routine: any urgent omission, submitted work shown as outstanding, optional work made compulsory, or unauthorised write blocks a release, and a person still reads the prose.',
      'Product metrics are defined but not yet measured on real use, so none are claimed here.',
    ],
    metricsTitle: 'What I would measure',
    metricHead: ['Metric', 'Why it matters', 'Status'],
    metrics: [
      ['Plans acted on', 'Share of days where at least one proposal is approved or deliberately skipped.', 'Defined'],
      ['Silent failures', 'Failed sources shown as empty or as free time. The target is zero.', 'Guarded by tests'],
      ['Edit before approve', 'How often a proposal is changed before approval: a signal of suggestion quality.', 'Derivable from approval history'],
      ['Demo engagement', 'Visits, case-study reads and outage toggles, with no cookies or personal data.', 'Live, cookie-free'],
      ['AI suggestion acceptance', 'Share of AI steps accepted, edited or ignored, and how much was edited.', 'Shown per visitor, not uploaded'],
      ['Grounded AI output', 'Share of model outputs that pass the evidence checks on the first attempt.', 'Measured on the Luna set'],
    ],
  },
  roadmap: {
    title: 'Roadmap',
    items: [
      ['Now', 'In-product AI with evals', 'A cited brief, assignment steps and one-line proposals, each checked against its evidence and scored on the Luna set.'],
      ['Next', 'Private instance', 'A signed-in version for real data, never mixed with the public demo.'],
      ['Later', 'Cloud collection', 'A scheduled assistant routine that gathers snapshots, replacing manual refreshes.'],
    ],
  },
  closing: 'The bet behind Dayweave is that, for personal planning, trust is the feature. The work was making uncertainty visible instead of hiding it.',
};

const zh: CaseStudyText = {
  eyebrow: '案例研究',
  title: 'Dayweave：一个把依据摆出来的计划助手',
  lede: '一款面向研究生的 AI 每日计划工具，围绕一个问题设计：今天的计划能信吗？每条建议都链接到来源，每次失败都保持可见，没有你批准的确切版本，任何内容都不会写进日历。',
  role: '个人项目：产品、设计与开发，借助 AI 编程助手完成。',
  toc: '本页目录',
  stats: [['7', '个演示页面'], ['196', '项自动化测试'], ['5', '项批准前检查'], ['0', '次未经批准的日历写入']],
  try: { title: '两分钟体验', today: '打开 Luna 的今天', outage: '模拟数据源故障', review: '审批一条 AI 提议', repo: 'GitHub 源码' },
  problem: {
    title: '问题',
    body: [
      '研究生要处理的事情分散在学习平台、课程网站、日历和邮箱里。难点不在于把它们列出来，而在于判断哪些是必做、哪些可选、哪些已经交了，以及空闲时间是不是真的空闲。',
      '通用 AI 助手很会总结这些信息，但在细节上常常自信地出错。早期一次试验里，模型把 72 小时窗口外一分钟到期的作业算成了紧急，把看不到提交记录的小组作业当成逾期，还悄悄漏掉了一个加载失败的课程网站。每个错误看起来都不大，但叠在一起，计划就没法用了。',
    ],
  },
  users: {
    title: '用户',
    body: '第一个用户是我自己：一名同时修三四门课、做小组项目、还在找工作的研究生。演示里用的是虚构学生 Luna，她的一周和我很像。要解决的任务：',
    jobs: ['告诉我今天必须做什么，以及为什么。', '告诉我每条信息从哪来、有多新。', '帮我找专注时间，不重复占用日程，最后由我决定。'],
  },
  principles: {
    title: '产品原则',
    items: [
      ['来源、建议、决定分开呈现', '来源怎么说、AI 建议什么、你怎么决定，放在三栏里分开显示。建议永远不会被当作事实。'],
      ['失败可见，绝不显示为 0', '数据源失败时保留上次的可靠记录，并标记待核实。日历空白显示为“未知”，而不是“空闲”。可以打开故障开关亲自看看。'],
      ['关键逻辑用确定性规则', '截止时间、是否必做和排程都由经过测试的代码完成。语言模型负责写摘要，那里措辞重要、出错代价低。'],
      ['批准一个确切、冻结的版本', '修改提议会生成新版本并清除之前的批准，所以你批准的永远就是将要写入的内容。'],
    ],
  },
  decisions: {
    title: '关键决策与取舍',
    intro: '最有价值的产品工作，是决定哪些事情不自动化。',
    chose: '选择', gaveUp: '放弃', why: '原因',
    items: [
      { title: 'Outlook 自动执行：不做', chose: '只读的 Google 日历和 Gmail 快照，写入在对话中批准。', gaveUp: '学校的 Outlook 日历，以及远程无人值守写入。', why: '连接器无法建立已授权的会话，也无法证明批准能可靠地传到执行端。硬上线就意味着没人能核实的写入。' },
      { title: '不做自主执行器', chose: '批准对应一个确切版本。助手重新检查实时日历，只写一次，再把事件读回来核对。', gaveUp: '一键“全部应用”和后台同步。', why: '一个悄悄写日历的工具，写错一次就失去信任。每次修改多一步，换来的是出错时能纠正。' },
      { title: '确定性规划器', chose: '规则写在代码里：09:00–24:00，每段不超过 90 分钟，留出休息间隔，至少 20% 空闲，只用明确的时长。', gaveUp: '看起来更“聪明”但无法复现的计划。', why: '早期试验之后，分类和排程都改成了经过测试的代码。日历覆盖不完整时，规划器会拒绝排程并说明原因。' },
      { title: 'AI 负责解释，规则负责决定', chose: '规则选出重点并检查每个时间块；模型负责解释、拆解和解析，每条输出都对照证据校验。', gaveUp: '让模型自己选重点，或把提议直接写进计划。', why: '措辞是模型最能帮上忙、出错代价也低的地方。截止时间、是否必做和冲突检查一旦出错就会失去信任，所以留在经过测试的代码里。' },
      { title: '先做静态公开演示', chose: '虚构数据跑在浏览器里，由 GitHub Pages 发布，AI 输出预先生成。', gaveUp: '演示里连接真实账号、实时调用模型。', why: '任何人都能安全、免费地体验完整流程。真实数据留给之后需要登录的私有版本。' },
    ],
  },
  ai: {
    title: '产品内 AI，逐条对照证据校验',
    body: [
      'Dayweave 里的 AI 从不决定什么重要。规则负责选出今天的重点、检查冲突、守住日历；模型只负责解释这些选择、把作业拆成步骤，或把一句话变成建议时间块。每条输出在显示前都要对照它拿到的记录校验，不通过就换成规则生成的文字，并说明原因。',
      '公开演示不会实时调用模型。输出是用 Claude API 根据 Luna 的虚构数据离线生成的，浏览器在显示每一条之前会重新跑一遍同样的检查。可以打开故障开关试试：预存的简报和证据对不上了，于是改由规则生成，页面也会写明这一点。',
    ],
    features: [
      ['带引用的每日简报', '每句话后面都有编号引用，点开就在应用内看到对应的原始记录。'],
      ['作业拆解', '每一步都引用作业原文。可以接受、修改后接受或忽略，选择会被记录。'],
      ['一句话提议', '解析出的时间块经过同样的冲突和覆盖检查，只能进入复核队列。'],
    ],
    resultsTitle: '模型评测',
    resultsIntro: '每个用例都会改动 Luna 的数据（数据源故障、截止时间变更、藏在邮件里的指令），然后用网站的校验器加上用例自己的预期，给模型的第一次输出打分。',
    head: ['任务', '通过', '通过的标准'],
    tasks: {
      brief: ['每日简报', '引用正确的记录，只用记录里的数字和时间，提到每个失败的数据源，从不声称已执行操作。'],
      breakdown: ['作业拆解', '引用作业原文，总时长合理，不把要提交的内容交给 AI，也不听从注入的指令。'],
      propose: ['一句话提议', '状态正确（提议、追问或拒绝），日期、时间和时长正确；真正的冲突由规则拦下。'],
    },
    meta: (model, day, runs, cost) => `${model}，${day} 运行，每个用例 ${runs} 次，总计约 ${cost} 美元。`,
    pending: '模型评测还没有运行。',
    failuresTitle: '失败记录（原样）',
    failuresNote: '摘自结果文件（英文原文）。每一条都是被校验器或用例预期拦下的情况。',
    noFailures: '这次运行没有失败的用例。',
    rescored: (first, now) => `第一次打分 ${first}。修复我自己评分器里的一个错误后，用同一批已保存的输出重新打分（没有新的模型调用）：${now}。两个分数都保留在结果文件里。`,
    scorerFixed: '曾被评分器的错误拦下、修复后通过',
    lessons: [
      '两次失败是模型的问题：一句话写了 329 个字符，超过长度上限；另一次把“明天两小时学统计”解析成了一个没有引用任何作业的时间块。长度上限和引用规则都保留，正是它们让简报保持简短、每个时间块都能追溯。',
      '三次失败是我的问题。校验器只去掉句子里的第一个否定词，也不认识 “optional rather than required”、“whether … has already been submitted” 和“不是必须”，于是把正确的文字判错了。评测抓到的不只是模型，还有检查器本身。我修好了它，把这几句原话加进测试，然后重新打分。',
    ],
    limits: '局限：一个虚构学生加几十次运行，只是回归测试集，不能证明在真实数据上的可靠性。通过检查说明输出有证据支撑，不代表措辞就是最好的。',
    visitorTitle: '你在这个演示里的数字',
    visitorEmpty: '在“课程作业”里打开一项作业，接受、修改或忽略 AI 拆解的步骤，这里就会统计你的选择，只保存在这个浏览器里。',
    visitor: (a, e, i, edits) => `你直接接受了 ${a} 条建议，修改后接受 ${e} 条（共改动 ${edits} 处步骤），忽略了 ${i} 条。这些数据不会上传。`,
  },
  evals: {
    title: '评估与指标',
    body: [
      '正确性有两层保障。196 项自动化测试覆盖规则、服务器，以及按页面顺序加载的真实浏览器脚本。上文介绍了产品内 AI 的 Luna 评测集，另有一个小型评估集检查助手的收集流程：只要漏掉紧急事项、把已交作业显示为未交、把可选作业变成必做，或出现未经批准的写入，就不能发布；机器检查通过后，还要有人读一遍文字。',
      '产品指标已经定义，但还没有在真实使用中测量，所以这里不报任何数字。',
    ],
    metricsTitle: '我会衡量什么',
    metricHead: ['指标', '为什么重要', '状态'],
    metrics: [
      ['计划被采纳', '至少有一条提议被批准或被主动跳过的天数占比。', '已定义'],
      ['静默失败', '失败的数据源被显示成空或空闲时间。目标是 0。', '由测试保障'],
      ['批准前修改', '提议在批准前被修改的频率，反映建议质量。', '可从审批记录计算'],
      ['演示互动', '访问量、案例页阅读和故障开关使用次数，不用 cookie，不收集个人数据。', '已上线，无 cookie'],
      ['AI 建议采纳', 'AI 拆解步骤被接受、修改或忽略的比例，以及修改了多少。', '按访客在本地显示，不上传'],
      ['有据可查的 AI 输出', '模型第一次输出就通过证据校验的比例。', '在 Luna 评测集上测量'],
    ],
  },
  roadmap: {
    title: '路线图',
    items: [
      ['现在', '产品内 AI 与评测', '带引用的简报、作业拆解和一句话提议，每条都对照证据校验，并在 Luna 评测集上打分。'],
      ['下一步', '私有版本', '需要登录的版本，用于真实数据，和公开演示完全分开。'],
      ['之后', '云端采集', '由定时运行的助手流程收集快照，取代手动刷新。'],
    ],
  },
  closing: 'Dayweave 背后的判断是：对个人计划工具来说，信任本身就是功能。这次的工作，就是把不确定性摆出来，而不是藏起来。',
};

export const caseStudy = { en, zh };
