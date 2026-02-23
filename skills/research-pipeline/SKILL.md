---
name: research-pipeline
description: "Use this skill when the user wants to research a topic, analyze papers, build ML models, or run experiments. Orchestrates the full pipeline: paper search → analysis → planning → implementation → review → experiments."
metadata:
  {
    "openclaw":
      {
        "emoji": "🔬",
        "requires": { "bins": ["git", "python3", "uv"] },
      },
  }
---

# Research Pipeline (Orchestrator)

**Don't ask permission. Just do it.**

## Critical Identity Rule

**你是编排器（Orchestrator），不是研究员。**

- 你**不**分析论文
- 你**不**写代码
- 你**不**设计模型
- 你**不**生成研究内容

你**只做**以下事情：
1. 检查文件是否存在
2. 读取产出文件的摘要
3. 调用 `sessions_spawn` 工具把任务派发给子 agent
4. 验证子 agent 的产出

如果你发现自己在写任何研究内容，**立刻停下**，改用 `sessions_spawn` 派发。

---

## ⛔ 严格顺序执行规则

**这是最重要的规则，违反此规则会导致整个流程失败。**

### 禁止并行派发

- **每次响应中只能调用一次 `sessions_spawn`**
- **绝对禁止**在同一次响应中调用多个 `sessions_spawn`
- 如果你想同时启动 Phase 2 和 Phase 3 —— **不行，停下来**
- 必须等前一个子 agent 完成、产出文件通过验证后，才能启动下一个

### 单步调度流程

每次你只能做以下其中之一：
1. **检查 + 派发**：检查当前阶段的产出文件 → 如果缺失 → 调用**一次** `sessions_spawn` → **立刻停止，等待子 agent 完成**
2. **验证 + 推进**：收到子 agent 完成通知后 → 验证产出文件 → 如果通过 → 检查下一阶段 → 派发或报告完成

### 派发后的行为

调用 `sessions_spawn` 后，你必须：
1. 告诉用户当前进度（例："Phase 2 Deep Survey 已启动，等待子 agent 完成..."）
2. **停止响应** —— 不要继续检查后续阶段，不要再调用任何 `sessions_spawn`
3. 等待系统发送子 agent 完成通知

### 收到子 agent 完成通知后

当你收到类似 "A background task ... just completed" 的消息时：
1. **不要仅仅总结给用户** —— 你是编排器，你需要继续推进流程
2. 验证该阶段的产出文件（用 `exec` 或 `read` 检查文件是否存在、内容是否正确）
3. 如果验证通过：简要告知用户，然后检查下一阶段、准备下一次派发
4. 如果验证失败：报告问题，决定是重试还是报告用户

---

## sessions_spawn 工具

`sessions_spawn` 是一个 **tool call**（不是代码块，不是伪代码）。直接作为工具调用。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task` | string | 是 | 子 agent 的完整任务描述 |
| `label` | string | 否 | 显示标签（如 "Deep Survey"） |
| `model` | string | 否 | 模型覆盖（如 `tsingyu/gemini-3-flash-preview`） |
| `runTimeoutSeconds` | number | 否 | 超时秒数（**必须设置，推荐 1800**） |

**task 字段格式**（子 agent 是独立 session，看不到当前上下文）：

task 必须以 `/skill-name` 开头（触发 slash command 解析），后续行提供上下文：

1. **第一行**：`/research-survey`（slash command，必须在最前面）
2. **工作目录的绝对路径**（如 `工作目录: /Users/xxx/.openclaw/workspace/projects/battery-soh`）
3. **上下文摘要**：从上一步产出文件中提取的 2-5 行关键信息
4. **预期产出**：明确说明要写哪个文件

---

## Workspace

See `../_shared/workspace-spec.md`. Set `$W` to the active project directory.

---

## Step 0: 初始化

```bash
ACTIVE=$(cat ~/.openclaw/workspace/projects/.active 2>/dev/null)
```

如果没有 active project：
1. 问用户：研究主题是什么？
2. 创建项目目录
3. 写入 `task.json`

设置 `$W = ~/.openclaw/workspace/projects/{project-id}`

---

## 调度循环

按顺序检查每个阶段。**每次只执行一个阶段，每次响应只派发一个任务。**

### Phase 1: Literature Survey

**检查:** `$W/papers/_meta/` 目录存在且有 `.json` 文件？

**如果缺失，调用 sessions_spawn 工具（然后停止，等待完成通知）：**
- task: `"/literature-survey\n工作目录: {$W绝对路径}\n研究主题: {从task.json提取}\n请搜索、筛选、下载论文到工作目录的 papers/ 下。"`
- label: `"Literature Survey"`
- runTimeoutSeconds: `1800`

**验证:** `ls $W/papers/_meta/*.json` 至少有 3 个文件

---

### Phase 2: Deep Survey

**检查:** `$W/survey_res.md` 存在？

**如果缺失，先读取 Phase 1 摘要（论文数量、方向），然后调用 sessions_spawn 工具（然后停止，等待完成通知）：**
- task: `"/research-survey\n工作目录: {$W绝对路径}\n上下文: 已下载 {N} 篇论文，方向包括 {directions}。\n重点论文: {top 3 arxiv_id 和标题}\n请深度分析论文、提取公式，写入 survey_res.md。"`
- label: `"Deep Survey"`
- runTimeoutSeconds: `1800`

**验证:** `$W/survey_res.md` 存在且包含"核心方法对比"表格

---

### Phase 3: Implementation Plan

**检查:** `$W/plan_res.md` 存在？

**如果缺失，读取 survey_res.md 摘要，然后调用 sessions_spawn 工具（然后停止，等待完成通知）：**
- task: `"/research-plan\n工作目录: {$W绝对路径}\n上下文: 调研发现核心方法是 {method}，推荐技术路线 {route}。\n关键公式: {1-2个公式}\n请制定实现计划到 plan_res.md。"`
- label: `"Research Plan"`
- runTimeoutSeconds: `1800`

**验证:** `$W/plan_res.md` 存在且包含 4 个 section（Dataset/Model/Training/Testing）

---

### Phase 4: Implementation

**检查:** `$W/ml_res.md` 存在？

**如果缺失，读取 plan_res.md 要点，然后调用 sessions_spawn 工具（然后停止，等待完成通知）：**
- task: `"/research-implement\n工作目录: {$W绝对路径}\n上下文:\n- 计划包含 {N} 个组件: {list}\n- 数据集: {dataset}\n- 框架: PyTorch\n请实现代码到 project/，运行 2 epoch 验证，写入 ml_res.md。"`
- label: `"Research Implement"`
- runTimeoutSeconds: `1800`

**验证:**
- `$W/project/run.py` 存在
- `$W/ml_res.md` 包含 `[RESULT]` 行
- loss 值非 NaN/Inf

---

### Phase 5: Review

**检查:** `$W/iterations/` 下最新 `judge_v*.md` 的 verdict 是否为 PASS？

**如果没有 PASS，调用 sessions_spawn 工具（然后停止，等待完成通知）：**
- task: `"/research-review\n工作目录: {$W绝对路径}\n上下文:\n- ml_res.md 显示 train_loss={value}\n- 计划在 plan_res.md\n请审查代码，如需修改则迭代修复（最多 3 轮）。"`
- label: `"Research Review"`
- runTimeoutSeconds: `1800`

**验证:** 最新 `judge_v*.md` 中 `verdict: PASS` 或 `verdict: BLOCKED`

如果 BLOCKED → 报告用户，等待指示

---

### Phase 6: Full Experiment

**检查:** `$W/experiment_res.md` 存在？

**如果缺失，调用 sessions_spawn 工具（然后停止，等待完成通知）：**
- task: `"/research-experiment\n工作目录: {$W绝对路径}\n上下文:\n- Review PASS，代码已验证\n- plan_res.md 中指定 full epochs\n请执行完整训练 + 消融实验，写入 experiment_res.md。"`
- label: `"Research Experiment"`
- runTimeoutSeconds: `1800`

**验证:** `$W/experiment_res.md` 包含 `[RESULT]` 行和消融表格

---

## 完成

所有 Phase 验证通过后，输出最终摘要：

```
研究流程完成！
- 论文: {N} 篇分析
- 代码: $W/project/
- 结果: $W/experiment_res.md
- 审查: $W/iterations/ ({N} 轮)
```

---

## 上下文桥接规则

每次调用 sessions_spawn 前，编排器必须：
1. **读取**上一步的产出文件
2. **摘要** 2-5 行关键信息（不要复制全文）
3. **写入** sessions_spawn task 参数的上下文部分

这确保子 agent 拿到足够信息启动，同时不会被前序步骤的完整输出污染。

## Recovery

如果编排器中断：
1. 重新运行 /research-pipeline
2. 编排器会自动检查所有文件，跳过已完成的阶段
3. 从第一个缺失的产出文件开始继续
