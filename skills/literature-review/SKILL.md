---
name: literature-review
description: "Write a literature review or survey paper from EXISTING papers. Guides through reading, note-taking, synthesis, and structured writing. Use after /literature-survey has collected papers."
metadata:
  {
    "openclaw":
      {
        "emoji": "📝",
      },
  }
---

# Literature Review Writing

Guide for writing a structured literature review or survey paper from papers you've already collected. This skill helps with reading strategy, note organization, and academic writing.

**Use this skill when:**
- You have collected papers (via `/literature-survey` or manually)
- Need to write a literature review section for a thesis/paper
- Writing a standalone survey paper
- Synthesizing findings across multiple papers

**NOT for:**
- Searching and discovering new papers (use `/literature-survey`)
- Generating research ideas (use `/idea-generation`)

---

## Prerequisites

Before starting, ensure you have:
1. Papers collected in `$WORKSPACE/papers/`
2. Ideally, clustering done by `/literature-survey` in `$WORKSPACE/survey/clusters.json`

Check active project:
```bash
cat ~/.openclaw/workspace/projects/.active 2>/dev/null
ls $WORKSPACE/papers/
```

---

## Phase 1: Reading Strategy

### 1.1 Triage Papers by Priority

Based on clusters from survey, prioritize reading:

| Priority | Criteria | Reading Depth |
|----------|----------|---------------|
| P1 (必读) | 高引用、奠基性工作、你的直接相关方向 | 精读全文 |
| P2 (重要) | 主要方法论、重要实验结果 | 读摘要+方法+实验 |
| P3 (参考) | 辅助材料、边缘相关 | 仅读摘要 |

Create `$WORKSPACE/review/reading_plan.md`:

```markdown
# Reading Plan

## P1 - 必读 (精读)
- [ ] [paper_id]: [title] - [reason]
- [ ] ...

## P2 - 重要 (选读)
- [ ] ...

## P3 - 参考 (略读)
- [ ] ...
```

### 1.2 Reading Notes Template

For each paper, create `$WORKSPACE/review/notes/{paper_id}.md`:

```markdown
# [Paper Title]

**ID**: [arxiv_id / DOI]
**Authors**: [author list]
**Year**: [year]
**Venue**: [conference/journal]
**Priority**: P1/P2/P3

## One-sentence Summary
[用一句话概括这篇论文的核心贡献]

## Problem & Motivation
- 研究什么问题？
- 为什么重要？
- 现有方法的不足？

## Method
### Core Idea
[核心创新点]

### Technical Approach
[关键技术细节]

### Key Equations
```latex
[重要公式]
```

## Experiments
- **Datasets**: [使用的数据集]
- **Baselines**: [对比方法]
- **Metrics**: [评价指标]
- **Key Results**: [主要结论]

## Strengths
1. [优点1]
2. [优点2]

## Limitations
1. [局限1]
2. [局限2]

## Connections
- 与 [paper_x] 的关系：[描述]
- 改进了 [method_y]：[如何改进]
- 被 [paper_z] 引用/扩展：[描述]

## Quotes for Citation
> "[重要原文]" (Section X, Page Y)

## My Comments
[你的思考、疑问、可能的改进方向]
```

---

## Phase 2: Synthesis & Organization

### 2.1 Build Comparison Table

Create `$WORKSPACE/review/comparison.md`:

```markdown
# Method Comparison

| Paper | Year | Category | Key Innovation | Dataset | Metric | Result |
|-------|------|----------|----------------|---------|--------|--------|
| [A]   | 2023 | Data-driven | ... | ... | RMSE | 0.05 |
| [B]   | 2022 | Hybrid | ... | ... | RMSE | 0.08 |
```

### 2.2 Timeline Analysis

Create `$WORKSPACE/review/timeline.md`:

```markdown
# Research Timeline

## 2018-2019: 早期探索
- [Paper A]: 首次提出 X 方法
- [Paper B]: 引入 Y 技术

## 2020-2021: 方法成熟
- [Paper C]: 提出 SOTA 方法
- ...

## 2022-2023: 新趋势
- [Paper D]: 开始关注 Z 问题
- ...

## Key Milestones
1. [Year]: [Event/Paper] - [Significance]
```

### 2.3 Taxonomy Design

Create `$WORKSPACE/review/taxonomy.md`:

```markdown
# Taxonomy of Approaches

## Dimension 1: Method Type
├── Data-driven
│   ├── Statistical (e.g., GPR, SVM)
│   ├── Deep Learning
│   │   ├── CNN-based
│   │   ├── RNN/LSTM-based
│   │   └── Transformer-based
│   └── Hybrid
└── Model-based
    ├── Electrochemical
    └── Equivalent Circuit

## Dimension 2: Data Source
├── Laboratory Data
├── Real-world Driving Data
└── Synthetic Data

## Dimension 3: Prediction Horizon
├── Short-term (< 100 cycles)
├── Medium-term (100-500 cycles)
└── Long-term (> 500 cycles)
```

---

## Phase 3: Writing Structure

### 3.1 Survey Paper Template

Create `$WORKSPACE/review/draft.md`:

```markdown
# [Survey Title]: A Comprehensive Review

## Abstract
[Background - 1 sentence]
[Problem - 1 sentence]
[What this survey covers - 2 sentences]
[Key findings - 2 sentences]
[Conclusion - 1 sentence]

## 1. Introduction

### 1.1 Background and Motivation
[为什么这个领域重要？]
[当前研究的热度和趋势]

### 1.2 Scope of This Survey
[本综述覆盖的范围]
[与已有综述的区别]

### 1.3 Contributions
本文的主要贡献：
1. [贡献1]
2. [贡献2]
3. [贡献3]

### 1.4 Organization
本文结构如下：
- Section 2: [内容]
- Section 3: [内容]
- ...

## 2. Background and Preliminaries

### 2.1 Problem Definition
[正式定义研究问题]

### 2.2 Key Concepts
[核心概念解释]

### 2.3 Evaluation Metrics
[常用评价指标]

## 3. Taxonomy of Methods

### 3.1 Category A: [Name]

#### 3.1.1 Subcategory A.1
[方法描述]
[代表性工作]

#### 3.1.2 Subcategory A.2
...

### 3.2 Category B: [Name]
...

## 4. Comparative Analysis

### 4.1 Quantitative Comparison
[对比表格]
[结果分析]

### 4.2 Qualitative Comparison
[方法特点对比]
[适用场景分析]

## 5. Datasets and Benchmarks

### 5.1 Public Datasets
| Dataset | Size | Source | Features |
|---------|------|--------|----------|
| ... | ... | ... | ... |

### 5.2 Benchmark Protocols
[常用的实验设置]

## 6. Challenges and Future Directions

### 6.1 Open Challenges
1. **Challenge 1**: [描述]
2. **Challenge 2**: [描述]

### 6.2 Emerging Trends
1. **Trend 1**: [描述]
2. **Trend 2**: [描述]

### 6.3 Recommended Research Directions
1. [方向1]
2. [方向2]

## 7. Conclusion
[总结主要发现]
[对领域的展望]

## References
[BibTeX entries]
```

### 3.2 Thesis Literature Review Template

For a thesis chapter, use this structure:

```markdown
# Chapter 2: Literature Review

## 2.1 Introduction
[本章目标和结构]

## 2.2 [Topic Area 1]
[相关工作综述]

## 2.3 [Topic Area 2]
[相关工作综述]

## 2.4 Summary and Research Gaps
[总结现有工作的不足]
[引出你的研究问题]
```

---

## Phase 4: Writing Tips

### Citation Density Guidelines

| Section | Citation Density |
|---------|------------------|
| Abstract | 0 citations |
| Introduction | 10-20 citations |
| Background | 5-10 citations |
| Main Survey | 50-100+ citations |
| Conclusion | 2-5 citations |

### Transition Phrases

**Introducing similar work:**
- "Similarly, [Author] proposed..."
- "Following this direction, ..."
- "Building upon [X], [Author] extended..."

**Introducing contrasting work:**
- "In contrast, [Author] argued..."
- "However, [Author] took a different approach..."
- "Unlike previous methods, ..."

**Summarizing:**
- "In summary, existing methods can be categorized into..."
- "The key insight from these works is..."

### Common Mistakes to Avoid

1. **列举式写作** - 不要只是 "A did X, B did Y, C did Z"
2. **缺乏比较** - 要分析方法之间的关系和区别
3. **时态混乱** - 描述方法用现在时，描述实验结果用过去时
4. **过度引用** - 不是每句话都需要引用
5. **遗漏重要工作** - 确保覆盖领域的奠基性工作

---

## Output Files

```
$WORKSPACE/review/
├── reading_plan.md       # 阅读计划
├── notes/                # 阅读笔记
│   ├── {paper_id}.md
│   └── ...
├── comparison.md         # 对比表格
├── timeline.md           # 时间线分析
├── taxonomy.md           # 分类体系
├── draft.md              # 综述草稿
└── bibliography.bib      # 参考文献
```

---

## Commands

- "帮我写综述" → Full workflow from reading to writing
- "生成阅读计划" → Create reading_plan.md
- "对比这些论文" → Generate comparison.md
- "写综述草稿" → Generate draft.md
- "润色这一段" → Polish specific section
