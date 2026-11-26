# Repo Checkup（Git 仓库接入体检工具）

一个用于评估公开 Git 仓库接入就绪度的轻量级 Web 体检工具。输入公开的 GitHub、GitCode 或 Gitee 仓库链接（默认扫描默认分支，支持通过 `/tree/<branch>` 指定具体分支），自动完成拉取与静态分析，并输出就绪度评分与风险清单。

## 核心体检维度

1. **基础完整度**：检查 `README`、依赖清单与启动脚本是否齐全
2. **Windows 专用脚本**：排查 `.bat`、`.cmd`、`.ps1`、`.vbs` 等跨平台兼容性风险
3. **硬编码路径**：检测 `C:\`、`/Users/` 等本机绝对路径硬编码
4. **密钥与敏感信息风险**：检测 `sk-`、`AKID`、`Bearer`、私钥片段及 `.env` 直接入库风险

## 目录结构

```text
repo-checkup/
├── shared/   # 前后端共享 TypeScript 类型定义 (@repo-checkup/shared)
├── server/   # Hono + Node.js 后端服务与插件化扫描引擎 (@repo-checkup/server)
└── web/      # React + Vite + Tailwind CSS 前端工作台 (@repo-checkup/web)
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
