# Repo Checkup（Git 仓库接入体检工具）

一个用于评估公开 Git 仓库接入就绪度的轻量级全栈 TypeScript Web 体检工具。输入公开的 **GitHub**、**GitCode** 或 **Gitee** 仓库链接（默认扫描默认分支，支持通过 `/tree/<branch>` 指定分支），自动完成浅克隆、静态分析与可视化展示，并支持按需手动生成 AI 接入建议。

## 界面预览

### 六维评估总览与能力雷达图

![六维评估总览与能力雷达图](./docs/images/overview-radar.jpg)

### 静态扫描风险清单（支持维度与级别筛选、敏感片段脱敏）

![静态扫描风险清单](./docs/images/risk-list.jpg)

## 核心能力

- **跨平台浅克隆与实时进度**：支持 GitHub / GitCode / Gitee 公开仓库与 `/tree/<branch>` 分支定位，通过 SSE 实时展示拉取与扫描百分比进度条；提取当前分支与 Commit 快照后立即清理 `.git` 与临时目录（兼容 Windows / macOS）。
- **四大静态体检维度**：
  1. **基础完整度（25 分）**：检查 `README`、依赖清单与启动脚本是否齐全
  2. **Windows 专用脚本（20 分）**：排查 `.bat`、`.cmd`、`.ps1`、`.vbs` 等跨平台兼容性风险
  3. **硬编码路径（25 分）**：检测 `C:\`、`/Users/` 等本机绝对路径硬编码（自动降级测试夹具误报）
  4. **密钥与敏感信息风险（30 分）**：检测 `sk-`、`AKID`、`AKIA`、`Bearer`、私钥片段及 `.env` 直接入库风险，并在服务端自动脱敏
- **手动触发 AI 接入建议（OpenAI 兼容接口）**：
  - 不拖慢主扫描流程，手动点击生成独立 AI 评分与 3–5 条优先级建议卡片（点击卡片可在右侧抽屉查看详细改造步骤）
  - 优先读取本地 `.env` 配置，支持前端快捷填入 **DeepSeek / Kimi / GLM**、一键拉取可用模型列表或手填模型名称，并支持一键保存到本地 `.env`

## 目录结构

```text
repo-checkup/
├── shared/        # 前后端共享 TypeScript 类型定义 (@repo-checkup/shared)
├── server/        # Hono + Node.js 后端服务与插件化扫描引擎 (@repo-checkup/server)
├── web/           # React + Vite + Tailwind CSS 前端工作台 (@repo-checkup/web)
└── docs/images/   # README 展示截图
```

## 常用命令

```bash
# 安装依赖
pnpm install

# 同时启动前后端开发服务
pnpm dev

# 构建全部工作区包
pnpm build

# 全量类型检查
pnpm typecheck

# 运行测试
pnpm test
```
