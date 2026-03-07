---
name: metabolism-init
description: "Initialize knowledge metabolism for a research topic: broad literature survey, build baseline knowledge state, set up metabolism workspace"
user-invokable: true
---

# Metabolism Initialization — Day 0 Baseline Building

你正在为一个研究方向执行知识新陈代谢的初始化。这是 Day 0：构建领域基线知识。

## 准备

1. 检查 `metabolism/config.json` 是否存在
   - 如果不存在：询问用户研究方向，创建 `metabolism/config.json`（包含 `keywords`, `categories`, `currentDay: 0`, `processed_ids: []`）
   - 如果已存在且 `currentDay > 0`：提示用户已完成初始化，无需重复执行
2. 创建目录结构（如不存在）：
   ```
   metabolism/
     knowledge/
     hypotheses/
     experiments/
     conversations/
     log/
   ```

## Step 1: 宽泛调研

委托 /research-collect 执行宽泛调研（不限日期），构建初始知识：

```
sessions_spawn({
  task: "/research-collect\n研究主题: {从 config.json 的 keywords 提取}\n这是 Day 0 基线构建，请做宽泛调研（不限日期），覆盖领域经典工作和近期进展。\n预期产出: papers/_meta/*.json + papers/_downloads/",
  label: "Day 0 Baseline Survey",
  runTimeoutSeconds: 1800
})
```

spawned session 共享工作目录，无需传路径。等待完成后，读取 `papers/_meta/*.json` 获取论文列表。

## Step 2: 阅读与知识提取

对每篇论文：
- 读 .tex 源码（优先）或 PDF
- 提取：核心方法、关键结论、领域现状

将每篇论文的 arXiv ID / DOI 追加到 `metabolism/config.json` 的 `processed_ids`。

## Step 3: 构建初始知识状态

创建 `metabolism/knowledge/_index.md`：
- Research Goal（从 config.json 提取）
- Topics 表格（按论文主题聚类）
- Cross-topic Links（如有）
- Timeline（记录 Day 0）

为每个识别出的主题创建 `metabolism/knowledge/topic-{name}.md`：
- 已知方法
- 关键论文与结论
- 开放问题

## Step 4: 记录日志

写入 `metabolism/log/{YYYY-MM-DD}-init.md`：

```markdown
# Day 0 — Initialization

日期: {YYYY-MM-DD}
论文: {N} 篇
主题: {列出识别的主题}
状态: 基线构建完成
```

更新 `metabolism/config.json`：`currentDay` 设为 1。

## 行为约束

1. 不捏造论文中未出现的事实性声明
2. 自主运行，不向人类提问（除初始配置外）
3. 修改知识文件前必须先读取当前内容（如存在）
