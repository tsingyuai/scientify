---
name: literature-survey
description: "Comprehensive literature survey for a research domain. Automatically searches, filters, clusters, and iterates to discover relevant papers. Use for: exploring a new research area, collecting papers for a topic, building a literature database."
metadata:
  {
    "openclaw":
      {
        "emoji": "🔍",
      },
  }
---

# Literature Survey

Comprehensive literature discovery workflow for a research domain. This skill searches broadly, filters by relevance, clusters by direction, and iterates to ensure complete coverage.

**Use this skill when:**
- Exploring a new research area
- Collecting all relevant papers for a topic
- Building a comprehensive literature database
- Need to understand the landscape of a field

**NOT for:**
- Summarizing papers you already have (use `/literature-review`)
- Finding a specific paper (use `arxiv_search` directly)
- Generating research ideas (use `/idea-generation`)

---

## Architecture: Isolated Sub-agent

This survey runs in an **isolated sub-session** to avoid context pollution. The main session only receives the final report.

```
Main Session
    ↓
sessions_spawn(task: "执行文献调研...", label: "literature-survey")
    ↓
Sub-agent Session (隔离上下文)
    ├── Phase 1: 生成检索词
    ├── Phase 2: 批量检索
    ├── Phase 3: 相关性筛选
    ├── Phase 4: 聚类分组
    ├── Phase 5: 迭代发现
    └── Phase 6: 生成报告
    ↓
返回主 Session: 摘要 + 文件路径
```

---

## When User Requests Literature Survey

**Step 1: Spawn isolated sub-agent**

When user says things like:
- "调研 [topic] 领域的文献"
- "帮我收集 [topic] 相关的论文"
- "Survey papers on [topic]"

Use `sessions_spawn` to run the survey in isolation:

```
sessions_spawn({
  task: `你是一个文献调研专家。请为研究主题 "{TOPIC}" 执行完整的文献调研。

## 调研目标
{USER_REQUIREMENTS}

## 执行流程

### Phase 1: 生成检索词
基于研究主题，生成 8-15 个检索词组合，覆盖：
- 核心概念的不同表述
- 相关技术方法
- 应用场景
- 英文和中文关键词（如适用）

将检索词保存到 $WORKSPACE/survey/search_terms.json

### Phase 2: 批量检索
对每个检索词使用 arxiv_search tool：
- max_results: 30-50 per query
- 合并去重（按 arxiv_id）
- 记录每篇论文的来源检索词

将原始结果保存到 $WORKSPACE/survey/raw_results.json

### Phase 3: 相关性筛选
阅读每篇论文的标题和摘要，判断与 "{TOPIC}" 的相关性：
- 5分：高度相关，直接研究此主题
- 4分：相关，涉及关键方法或应用
- 3分：部分相关，可作为参考
- 2分：边缘相关
- 1分：不相关

保留 score >= 4 的论文。
将筛选结果保存到 $WORKSPACE/survey/filtered_papers.json

### Phase 4: 聚类分组
分析筛选后论文的摘要，识别 3-6 个研究方向/子主题。
为每个方向创建子文件夹并分配论文：

$WORKSPACE/papers/
├── {direction-1}/
│   ├── paper_list.md
│   └── [arxiv_ids...]
├── {direction-2}/
│   └── ...
└── uncategorized/

将聚类结果保存到 $WORKSPACE/survey/clusters.json

### Phase 5: 迭代发现（1-2轮）
检查高分论文的摘要，识别：
- 提到的新方法名称
- 引用的重要工作
- 新的关键词

如果发现新方向，补充检索并重复 Phase 2-4。
最多迭代 2 轮。

### Phase 6: 生成报告
创建 $WORKSPACE/survey/report.md：

# 文献调研报告: {TOPIC}

## 调研概要
- 检索词数量: X
- 初始检索: Y 篇
- 筛选后: Z 篇
- 研究方向: N 个

## 研究方向分布

### 方向1: [名称]
- 论文数量: X
- 代表性工作: [列表]
- 主要特点: [描述]

### 方向2: [名称]
...

## 高影响力论文 (Top 10)
| 排名 | 标题 | 年份 | 相关度 | 方向 |
|-----|------|-----|-------|-----|
| 1   | ... | ... | 5     | ... |

## 研究趋势
[基于论文年份分布的观察]

## 发现的新方向
[迭代中发现的额外关键词和方向]

## 建议阅读顺序
1. [入门级论文]
2. [核心方法论文]
3. [最新进展]

---

完成后，向主 session 报告：
- 总共发现的论文数量
- 识别的研究方向
- 报告文件位置`,
  label: "literature-survey-{TOPIC_SLUG}",
  runTimeoutSeconds: 900,
  cleanup: "keep"
})
```

**Step 2: Wait and relay results**

Sub-agent 完成后会自动 announce 结果到主 session。
将结果摘要展示给用户，包括：
- 发现的论文数量
- 主要研究方向
- 报告文件位置

---

## Workspace Structure

```
~/.openclaw/workspace/projects/{project-id}/
├── project.json
├── survey/                    # 调研过程数据
│   ├── search_terms.json      # 检索词列表
│   ├── raw_results.json       # 原始检索结果
│   ├── filtered_papers.json   # 筛选后的论文
│   ├── clusters.json          # 聚类结果
│   ├── iterations.log         # 迭代记录
│   └── report.md              # 最终报告
├── papers/                    # 按方向组织的论文
│   ├── {direction-1}/
│   │   ├── paper_list.md
│   │   └── 2401.12345/       # .tex 源文件
│   ├── {direction-2}/
│   └── uncategorized/
└── ideas/                     # 后续 idea-generation 输出
```

---

## Data Schemas

### search_terms.json
```json
{
  "topic": "battery life prediction",
  "generated_at": "2024-01-15T10:00:00Z",
  "terms": [
    {"term": "battery remaining useful life", "category": "core"},
    {"term": "lithium-ion degradation prediction", "category": "method"},
    {"term": "SOH estimation neural network", "category": "technique"},
    {"term": "EV battery health monitoring", "category": "application"}
  ]
}
```

### filtered_papers.json
```json
{
  "filtered_at": "2024-01-15T10:30:00Z",
  "total_raw": 245,
  "total_filtered": 42,
  "papers": [
    {
      "arxiv_id": "2401.12345",
      "title": "...",
      "abstract": "...",
      "authors": ["..."],
      "published": "2024-01-15",
      "relevance_score": 5,
      "source_terms": ["battery RUL", "degradation prediction"],
      "notes": "直接研究锂电池RUL预测"
    }
  ]
}
```

### clusters.json
```json
{
  "clustered_at": "2024-01-15T11:00:00Z",
  "clusters": [
    {
      "id": "data-driven",
      "name": "数据驱动方法",
      "description": "使用机器学习/深度学习的方法",
      "paper_count": 15,
      "paper_ids": ["2401.12345", "2401.12346", "..."],
      "keywords": ["LSTM", "CNN", "transformer", "neural network"]
    },
    {
      "id": "physics-based",
      "name": "物理模型方法",
      "description": "基于电化学机理的方法",
      "paper_count": 8,
      "paper_ids": ["..."]
    }
  ]
}
```

---

## Quick Mode (Without Sub-agent)

For smaller surveys (< 50 papers), can run directly without spawning:

User: "快速调研一下 [topic]，不超过 30 篇"

→ Run Phase 1-4 directly in main session
→ Skip iteration
→ Generate simplified report

---

## Commands

- "调研 [topic] 领域" → Full survey with sub-agent
- "快速调研 [topic]" → Quick mode, 30 papers max
- "继续上次的调研" → Resume from existing survey data
- "扩展调研 [new direction]" → Add new search terms and iterate
