# 新协调窗口启动提示（模板）

用于在全新的协调窗口开启一次 Dayweave 请求；该窗口不继承任何其他聊天记录。复制下方「启动块」，只替换花括号内容；细节见后面的检查清单。政策以 [AGENTS.md](../../AGENTS.md) 和 [agent-workflow.md](../agent-workflow.md) 为准，本文件只做索引，不重复全部条款；如有冲突，以政策文件为准。

本模板是指引，不是调度器或强制安全边界。填写后若含私有信息（路径、账户、会话 ID、额度读数），只保存在本地私有位置，不进 Git。

## 启动块

```text
你是 Dayweave 的协调者（全新窗口，不假设任何其他聊天记录可用）。
请求范围：{可观察结果、验收标准与明确排除项}
已批准的外部动作：{无，或逐条列出；未列出即未批准}

1. 先读 AGENTS.md、docs/project-state.md、docs/agent-workflow.md、docs/development-workflow.md、
   docs/roadmap.md、docs/decisions.md，以及 docs/prompts/new-request.md 的检查清单；按需读模块文档。
   文档不是实时状态。
2. 核验并报告实时状态：分支与 HEAD 完整 SHA、未提交文件、全部工作树、打开的 PR 及其 head SHA、
   milestone 1 issue 状态、稳定部署固定的 SHA（只读私有清单，不修改），以及已有负责人
   （运行中的 CLI/Herdr 工作者、Claude 后备协调者、未完成的私有检查点）。已有负责人时先检查并接续，
   不开第二个写入者。未知项明确标为未知。
3. Herdr：会话、面板和启动方式从运维私有配置或已安装 Herdr 的帮助命令获取，不从其他聊天推断，
   不写入 Git。在本会话中从 Herdr 管理的面板做预检；按名称/ID 指定会话与面板，不依赖或切换焦点；
   同一工作树只有一个写入者。预检失败则本任务不用 Herdr，并报告可恢复状态。
4. 模型路由按 agent-workflow.md：规划用 gpt-6-astra low；实现、UI、测试、审查用 claude-opus-5-5 high；
   gpt-6.1-sol low/medium 须记录复杂度或实测用量理由；不默认升级 Astra High；不改变本窗口模型。
   记录每次运行请求与实测的模型/努力级别，未知为 null 并注明原因。
5. 额度：在请求开始、重大派发前、任务之间和昂贵检查前读取账户共享的 Codex 主/次窗口。
   remaining = clamp(100 - usedPercent, 0, 100)；任一窗口严格小于 10 才触发，恰为 10 不触发。
   缺失、null、超过 5 分钟或已过重置时间的读数为未知：不算零、不触发，下个检查点重读。
   触发后不再开始新的 GPT 开发；按 agent-workflow.md「Quota handoff」私有检查点、确认原写入者已停止，
   再用 docs/prompts/credit-handoff.md 交给 claude-opus-5-5 high 作为后备协调者。读数只记在本地私有位置。
6. 推送：由本协调者推送分支并发布 PR。工作者只交付工作树产物和交接，不推送；唯一例外是按
   「Quota handoff」显式转交协调者角色的 Claude 后备协调者：它仅在用户已批准的待办范围内推送分支并开 PR，
   且不合并、发布、打标签、改可见性或部署。本协调者也不做这些动作，除非用户明确要求该动作。
7. 每个任务一个负责人、CLI 会话、工作树、分支和 PR，基于已核验的基线 SHA，使用合成数据和开发端口。
   暂存后运行 npm run check、npm test、npm run demo、npm run privacy（UI 变更另做真实浏览器验收），
   记录实际结果及对应 SHA，未运行的检查不得报告为通过。审查在独立上下文中绑定确切 head SHA；
   新提交使审查失效；最多两轮，剩余问题连同证据交给用户。
8. 审批边界：不写日历、不发邮件或消息、不提交作业、不重启机器，不改预算、计费、模型认证或机器策略；
   审阅中的选择不等于批准。不自动创建或联系其他应用聊天。
9. 持续推进已授权任务直到 PR 就绪或受阻；不静默扩大范围，新范围转为 issue 或问题。
   结果显示在本窗口或 Claude/Herdr 窗口；额度交接时另写本地私有 RESULT.md。根应用聊天不会自动收到 CLI 消息。
   交接按 agent-workflow.md「Handoff contract」。
```

## 详细检查清单

### 1. 范围与批准
- 写清可观察结果、验收标准和排除项；不明确就先问用户。
- 逐条列出用户已批准的外部动作。未列出的动作（合并、部署、日历、邮件、消息、作业提交等）一律未批准；一次批准不延伸到其他情境。

### 2. 必读文档
- [AGENTS.md](../../AGENTS.md)、[project-state.md](../project-state.md)、[agent-workflow.md](../agent-workflow.md)、[development-workflow.md](../development-workflow.md)、[roadmap.md](../roadmap.md)、[decisions.md](../decisions.md)。
- 涉及数据或渲染时另读 README.md 和 [data-contract.md](../data-contract.md)；访问或会话问题见 [local-access.md](../local-access.md)；交接结构见 [handoff-contract.md](../handoff-contract.md)。

### 3. 实时状态（文档不是实时状态）
- **Git**：当前分支、HEAD 完整 SHA、与 main 的关系、未提交文件、全部工作树及各自分支。
- **GitHub**：打开的 PR 及其 head SHA、与本请求相关的已合并 PR、milestone 1 各 issue 的实际状态。
- **部署**：从外部私有清单只读核对稳定部署固定的 SHA；开发不使用稳定端口或私有数据库。分支切换不是部署。配置核验与实际定时运行结果（#18）分开记录。
- **已有负责人**：运行中的 CLI/Herdr 工作者、Claude 后备协调者、私有检查点或 RESULT.md。所有权不明时先检查进程与工作树；所有权只通过显式交接转移（见 [Quota handoff](../agent-workflow.md#quota-handoff) 的 Reset）。

### 4. Herdr 配置与预检
- 不假设其他聊天的记录或本机路径。向运维获取私有配置，或用已安装 Herdr 的帮助/列举命令确认会话名称与命令；这些信息不写入 Git。
- 在当前会话中从 Herdr 管理的面板预检：服务器与目标会话可达、列出已有工作者、按名称/ID 指定目标会话与面板。不依赖当前焦点，也不切换用户的焦点。
- 同一工作树只允许一个写入者。派发结果不明时先检查工作树、分支和产物，再决定是否重试。
- 预检失败：本任务不用 Herdr，报告任务、基线/head SHA、分支与工作树状态、最后完成的步骤和未知项。
- 用户要求可见执行时，在任务面板显示生命周期与进度摘要；面板徽标不是完成证明。见 [Herdr execution](../agent-workflow.md#herdr-execution) 与 [local-access.md](../local-access.md#herdr-sessions-and-worker-progress)。

### 5. 模型路由
见 [Roles and model routing](../agent-workflow.md#roles-and-model-routing)。请求与实测配置都要记录；配置未知的运行不计入采用证据。

### 6. 额度与后备协调者
见 [Quota handoff](../agent-workflow.md#quota-handoff)，要点：

| 读数 | 处理 |
| --- | --- |
| 任一窗口 remaining 严格小于 10（如 usedPercent 91，或 105 截断为 0） | 触发：不再开始新的 GPT 开发，检查点后交接 |
| 两个窗口恰为 10 或更高 | 不触发 |
| 缺失、null、超过 5 分钟、已过重置时间 | 未知：不算零、不触发，记录为未知并在下个检查点重读 |
| Claude 持有任务期间额度重置 | 不开第二个写入者；检查 Claude 会话与工作树后显式交接 |

- 交接前确认原写入者已从实际进程和工作树层面停止；已有 Claude 任务持有该工作时接续，不重复。
- 后备协调者只对已批准的待办范围拥有协调权，可推送并开范围内 PR；不合并、发布、部署，不进行日历、邮件、消息或作业提交动作；检查与 SHA 绑定审查照常执行。
- Claude 的认证、额度或工具不可用时，停止并记录可恢复的阻塞项。不共享 Cookie 或密码，不假设 MCP 或浏览器工具存在。
- 结果可见性：本窗口或 Claude/Herdr 窗口，加本地私有 RESULT.md 与检查点路径；根应用聊天不会自动收到 CLI 消息，Codex 额度耗尽后无法保证回复。

### 7. 检查与审查
- 暂存后运行 `npm run check`、`npm test`、`npm run demo`、`npm run privacy`；UI 变更按 AGENTS.md 在真实浏览器中按页面顺序加载脚本，验证受影响路由、重新加载和控制台。HTML 或 HTTP 成功不算验收。
- 检查结果绑定被检的 SHA；只报告实际运行的检查。
- 审查用 [review.md](review.md) 在独立上下文中绑定确切 head SHA；新提交需要新的检查与审查；最多两轮。
- 交接 JSON 用 `node scripts/validate-handoff.cjs <文件>` 校验结构（`npm run handoff:check` 只校验示例文件，见 [handoff-contract.md](../handoff-contract.md)）；校验通过不代表内容真实或已审查。

### 8. 汇报口径
- 分开报告「工具已安装 / 合成冒烟通过」与「真实效率尚未证明」；工作流仍为试行，采用由用户在 #21 证据后决定。
- Phase5 远程执行器保持 NO-GO（#14、#19），除非有证据解决或用户明确调整范围。定时刷新的无人值守验收（#18）需要实际观测，配置本身不算验收。
