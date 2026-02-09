---
name: research-survey
description: "[Read when prompt contains /research-survey]"
metadata:
  {
    "openclaw":
      {
        "emoji": "📖",
      },
  }
---

# Research Survey (Deep Analysis)

**Don't ask permission. Just do it.**

**Workspace:** See `../_shared/workspace-spec.md`. Set `$W` to the active project directory.

## Prerequisites

Read and verify these files exist before starting:

| File | Source |
|------|--------|
| `$W/papers/_meta/*.json` | /literature-survey |
| `$W/papers/_downloads/` or `$W/papers/{direction}/` | /literature-survey |
| `$W/repos/` (optional) | git clone in /literature-survey or manually |

**If any prerequisite is missing, STOP and report:** "需要先运行 /literature-survey 完成论文下载"

## Output

| File | Content |
|------|---------|
| `$W/notes/paper_{arxiv_id}.md` | Per-paper structured notes |
| `$W/survey_res.md` | Synthesis report |

---

## Workflow

### Step 1: 收集论文列表

```bash
ls $W/papers/_meta/
```

读取所有 `.json` 元数据，构建论文列表。按 score 降序排列。

### Step 2: 逐篇深度分析

**对每篇论文**（优先高分论文）：

#### 2.1 读 .tex 源码

找到论文的 .tex 文件（在 `_downloads/{arxiv_id}/` 或 `{direction}/{arxiv_id}/` 下），重点读取：
- **Method / Approach** section
- **Model Architecture** section
- 数学公式定义

如果没有 .tex（只有 PDF），基于 abstract 分析。

#### 2.2 提取核心内容

从 .tex 中提取：
- **核心方法**：1-2 段描述
- **数学公式**：至少 1 个关键公式（保留 LaTeX 格式）
- **创新点**：与同领域其他方法的区别

#### 2.3 映射到代码（如果 repos/ 存在）

如果 `$W/repos/` 中有相关仓库：
- 找到公式对应的代码实现
- 记录文件路径和行号

#### 2.4 写入笔记

写入 `$W/notes/paper_{arxiv_id}.md`：

```markdown
# {Paper Title}

- **arXiv:** {arxiv_id}
- **核心方法:** {1-2 sentences}

## 数学公式

$$
{key formula in LaTeX}
$$

含义：{解释}

## 代码映射

文件：`repos/{repo}/path/to/file.py:L42-L60`
```python
# relevant code excerpt (< 20 lines)
```

## 与本研究的关系

{如何应用到当前研究}
```

### Step 3: 综合报告

读取所有 `notes/paper_*.md`，写入 `$W/survey_res.md`：

```markdown
# Survey Synthesis

## 论文总览
- 分析论文数: {N}
- 涉及方向: {list}

## 核心方法对比

| 论文 | 方法 | 核心公式 | 复杂度 | 优势 |
|------|------|----------|--------|------|
| ... | ... | ... | ... | ... |

## 技术路线建议

基于以上分析，推荐的技术路线是：
{建议}

## 关键公式汇总

{列出所有提取的核心公式}
```

---

## Rules

1. 每篇论文必须读 .tex 原文（如有），不能只读 abstract
2. 每篇笔记必须包含至少 1 个数学公式
3. 如果有 repos/，必须尝试找到公式到代码的映射
4. survey_res.md 必须包含方法对比表
