---
name: write-review-paper
description: "Use this when the user wants to write a literature review, survey paper, or thesis chapter from existing papers. Guides reading strategy, note-taking, synthesis, and academic writing. NOT for searching new papers (/research-collect) or generating ideas (/idea-generation)."
metadata:
  {
    "openclaw":
      {
        "emoji": "📝",
      },
  }
---

# Literature Review Writing

**Don't ask permission. Just do it.**

Guide for writing a structured literature review or survey paper from papers you've already collected. This skill helps with reading strategy, note organization, and academic writing.

**Workspace:** `$W` = working directory provided in task parameter. Outputs go to `$W/review/`.

## Prerequisites

Before starting, ensure you have:
1. Papers collected in `$W/papers/`
2. Ideally, clustering done by `/research-collect` in `$W/survey/clusters.json`

Check workspace:
```bash
ls $W/papers/
ls $W/survey/ 2>/dev/null
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

Create `$W/review/reading_plan.md`:

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

For each paper, create `$W/review/notes/{paper_id}.md` using template in `references/note-template.md`.

---

## Phase 2: Synthesis & Organization

### 2.1 Build Comparison Table

Create `$W/review/comparison.md`:

```markdown
# Method Comparison

| Paper | Year | Category | Key Innovation | Dataset | Metric | Result |
|-------|------|----------|----------------|---------|--------|--------|
| [A]   | 2023 | Data-driven | ... | ... | RMSE | 0.05 |
| [B]   | 2022 | Hybrid | ... | ... | RMSE | 0.08 |
```

### 2.2 Timeline Analysis

Create `$W/review/timeline.md`:

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

Create `$W/review/taxonomy.md`:

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

Create `$W/review/draft.md` using template in `references/survey-template.md`.

Key sections: Abstract → Introduction → Background → Taxonomy → Comparison → Datasets → Future Directions → Conclusion

### 3.2 Thesis Literature Review Template

For a thesis chapter:
```markdown
# Chapter 2: Literature Review
## 2.1 Introduction
## 2.2 [Topic Area 1]
## 2.3 [Topic Area 2]
## 2.4 Summary and Research Gaps
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
$W/review/
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
