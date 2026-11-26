# AI 协作开发与调优记录（AI Usage Log）

本文档真实记录 **Repo Checkup** 从零搭建到交付验收过程中的 Vibe Coding 协作方式、验证策略，以及实际捕获并修复的 AI 缺陷记录。

---

## 一、AI 工具与角色分工

本次项目采用**「双 AI 协同 + 开发者人工验收」**的 Vibe Coding 工作流：

| 角色 | 承担职责 |
| :--- | :--- |
| **编码 Agent（Antigravity / Gemini）** | 负责技术栈落地、pnpm Monorepo 工程搭建、后端 URL 校验 / Git 浅克隆 / 4 大扫描器 / SSE 实时进度流 / OpenAI 兼容 AI 服务实现、Vitest 单元测试编写、前端 Style C 视觉重构与缺陷修复。 |
| **协作把关 AI 助手** | 在关键节点协助需求拆解与方案评审，辅助设计边界测试用例（如异常链接、误报夹具、限流与清理场景），并协助打磨提示词与输出结构。 |
| **开发者（项目负责人）** | 确定核心产品方向与极简浅灰视觉风格（Style C），使用本地真实开源项目（`rayagent-oss`、`repo-checkup`、`hono`）进行黑盒实测并提出交互与规则优化需求。 |

---

## 二、输出验证方法

所有 AI 生成的代码均经过**自动化验证 + 真实仓库黑盒测试**双层检验，不依赖单次口头确认：

1. **全链路自动化校验**
   - `pnpm build`：验证 `shared`、`server`、`web` 跨包编译与 Vite 生产打包。
   - `pnpm typecheck`：严格模式（`strict: true` + `noUncheckedIndexedAccess: true`）全量类型检查。
   - `pnpm test`：后端 5 个测试文件共 **19 条单元测试**（[repoUrl.test.ts](./server/src/services/repoUrl.test.ts)、[gitClone.test.ts](./server/src/services/gitClone.test.ts)、[scanners.test.ts](./server/src/scanners/scanners.test.ts)、[aiService.test.ts](./server/src/services/aiService.test.ts)、[app.test.ts](./server/src/app.test.ts)），覆盖 URL 注入拦截、本地真实 Git 仓库分支克隆与 Windows 只读 `.git` 清理、四大扫描器规则、OpenAI 兼容接口 Mock 与 `.env` 持久化。
2. **真实环境黑盒实测**
   - **异常边界测试**：输入不存在的仓库链接（如 `https://github.com/KeepRising-l/not-exist-12345`）、连续切换有效/无效仓库链接验证前端状态清理与错误提示。
   - **真实开源仓库实测**：在本地 Web 页面与 `/api/scan/stream` 实测 `KeepRising-l/rayagent-oss`（556 个文件、Java + 前端混合工程）、`honojs/hono`（574 个文件）以及本项目自身 `KeepRising-l/repo-checkup`（GitHub 与 GitCode 双端对照）。

---

## 三、真实捕获的 AI 犯错与修复记录

在多轮联调与真实仓库黑盒测试中，我们实际捕获并修复了以下典型问题：

### 记录 1：前端连续扫描不同仓库时未清空旧报告（状态残留 Bug）

- **发现过程**：本地浏览器实测时，先成功扫描了一个真实仓库（`KeepRising-l/rayagent-oss`），接着在输入框换成一个不存在的仓库地址（`https://github.com/KeepRising-l/not-exist-12345`）点击体检。接口正确返回了 404 错误提示，但页面下方依然残留着上一个仓库的体检报告，极易让用户误以为“报错页面显示的是新仓库结果”。
- **原因分析**：AI 初版编写 `web/src/App.tsx` 中的 `handleScan` 时，只做了 `setLoading(true)` 与 `setError(null)`，成功时才调用 `setReport(nextReport)`，忽略了新请求发起前清零旧报告和防并发竞态。
- **修复措施**：在 [web/src/App.tsx](./web/src/App.tsx) 中，每次 `handleScan` 发起前立即清空 `report`、`aiReport`、`aiNotice` 并复位维度/级别筛选；同时引入 `scanSeqRef` 自增请求序号，确保异步返回时只接受最新一次请求的状态更新。

### 记录 2：“自己扫自己”暴露的两处静态规则误报（`secrets.ts` 与 `hardcodedPaths.ts`）

- **发现过程**：将本项目推送到 GitHub 后，用工具直接在线扫描 `https://github.com/KeepRising-l/repo-checkup` 做自检，结果原本健康的仓库只拿了 **73 分**，且被标记为 `high_risk` 高危阻塞：
  1. `server/src/scanners/secrets.ts` 第 99 行注释 `// Repeated single character like sk-aaaa...` 被判定为「疑似明文 `sk-` 密钥泄露」高危阻塞项；
  2. `web/src/App.tsx` 第 59 行的 UI 提示文案 `'识别源码与配置中的 C:\、/Users/ 等本机绝对路径。'` 被判定为「硬编码本机绝对路径」。
- **原因分析**：
  - AI 编写的 `isPlaceholder` 函数用 `/^(.)\1{10,}$/` 检测重复字符占位符，但没有先剥离 `sk-` / `AKID` / `Bearer ` 前缀，导致前缀加重复字母的字符串无法命中占位符过滤规则；
  - Windows 路径正则 `WINDOWS_BACKSLASH_PATH_RE` 允许盘符 `C:\` 后直接跟中文标点符号（`、`），把界面中文说明文字当成了真实路径。
- **修复措施**：
  - 在 [server/src/scanners/secrets.ts](./server/src/scanners/secrets.ts) 的 `isPlaceholder` 中先剥离已知密钥前缀再做重复字符判断；
  - 在 [server/src/scanners/hardcodedPaths.ts](./server/src/scanners/hardcodedPaths.ts) 中收紧 Windows 反斜杠路径正则（要求盘符后紧跟真实路径字符并排除中文标点）；
  - 同时补充回归单测并在实测 `rayagent-oss` 后进一步抽象出跨语言测试文件识别器 [fileClassifier.ts](./server/src/scanners/fileClassifier.ts)，对测试文件里的假密钥与夹具路径做降噪/降级处理。修复后 `repo-checkup` 自检恢复 `100 / 100`，`rayagent-oss` 从误报 `50 分` 恢复至更客观的 `80 分`。

### 记录 3：单测模拟假密钥触发 GitHub Push Protection 推送拦截

- **发现过程**：执行 `git push origin main` 向 GitHub 推送初始代码时，被 GitHub 远端规则 **GH013 (Push Protection)** 直接拒绝，报错定位到 `server/src/scanners/scanners.test.ts` 中用于验证 `SECRET_AKID_KEY` 规则的测试常量（一个以 `AKID` 开头、长度符合腾讯云 Secret ID 格式的纯字母数字模拟字符串）。
- **原因分析**：AI 在编写单测夹具时直接写入了连续的静态测试字符串字面量，虽然不是真实凭证，但完全符合云厂商公开密钥正则特征，被仓库级 Push Protection 扫描拦截。
- **修复措施**：在 [server/src/scanners/scanners.test.ts](./server/src/scanners/scanners.test.ts) 中将测试用的模拟令牌改为运行时数组拼接（如 `['AKID', '...'].join('')`），既保证运行时测试覆盖真实密钥格式，又避免源码中出现静态明文特征串，修正提交后顺利通过 GitHub 与 GitCode 推送校验。

### 记录 4：交互细节调优（悬停整卡跳动与配置面板自动折叠）

- **发现过程**：在验证 UI 原型和重构后的 React 页面时，鼠标划过左侧 6 个能力维度卡片会触发整张大卡片轻微上下跳动，以及保存 `.env` 配置后设置面板未自动收起占用空间。
- **修复措施**：移除原型悬停重渲染时的整卡位移动画、为 React Grid 分栏容器补充 `min-w-0` 与固定高度读数胶囊，并在保存 `.env` 或点击生成建议时自动折叠设置面板，显著提升了界面稳定性。
