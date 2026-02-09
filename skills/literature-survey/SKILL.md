---
name: literature-survey
description: "Use this when the user wants to find, download, or collect academic papers on a topic. Searches arXiv, filters by relevance, downloads PDFs and sources, clusters by research direction."
metadata:
  {
    "openclaw":
      {
        "emoji": "🔍",
      },
  }
---

# Literature Survey

**Don't ask permission. Just do it.**

## Output Structure

```
~/.openclaw/workspace/projects/{project-id}/
├── survey/
│   ├── search_terms.json      # 检索词列表
│   └── report.md              # 最终报告
└── papers/
    ├── _downloads/            # 原始下载
    ├── _meta/                 # 每篇论文的元数据
    │   └── {arxiv_id}.json
    └── {direction}/           # 整理后的分类
```

---

## Workflow

### Phase 1: 准备

```bash
ACTIVE=$(cat ~/.openclaw/workspace/projects/.active 2>/dev/null)
if [ -z "$ACTIVE" ]; then
  PROJECT_ID="<topic-slug>"
  mkdir -p ~/.openclaw/workspace/projects/$PROJECT_ID/{survey,papers/_downloads,papers/_meta}
  echo "$PROJECT_ID" > ~/.openclaw/workspace/projects/.active
fi
PROJECT_DIR="$HOME/.openclaw/workspace/projects/$(cat ~/.openclaw/workspace/projects/.active)"
```

生成 4-8 个检索词，保存到 `survey/search_terms.json`。

---

### Phase 2: 增量搜索-筛选-下载（循环）

**对每个检索词重复以下步骤**：

#### 2.1 搜索

```
arxiv_search({ query: "<term>", max_results: 30 })
```

#### 2.2 即时筛选

对返回的论文**立即**评分（1-5），只保留 ≥4 分的。

评分标准：
- 5分：核心论文，直接研究该主题
- 4分：相关方法或应用
- 3分及以下：跳过

#### 2.3 下载有用论文

```
arxiv_download({
  arxiv_ids: ["<有用的论文ID>"],
  output_dir: "$PROJECT_DIR/papers/_downloads"
})
```

#### 2.4 写入元数据

为每篇下载的论文创建元数据文件 `papers/_meta/{arxiv_id}.json`：

```json
{
  "arxiv_id": "2401.12345",
  "title": "...",
  "abstract": "...",
  "score": 5,
  "source_term": "battery RUL prediction",
  "downloaded_at": "2024-01-15T10:00:00Z"
}
```

**完成一个检索词后，再进行下一个。** 这样避免上下文被大量搜索结果污染。

---

### Phase 3: 分类整理

所有检索词处理完毕后：

#### 3.1 读取所有元数据

```bash
ls $PROJECT_DIR/papers/_meta/
```

读取所有 `.json` 文件，汇总论文列表。

#### 3.2 聚类分析

根据论文的标题、摘要、来源检索词，识别 3-6 个研究方向。

#### 3.3 创建文件夹并移动

```bash
mkdir -p "$PROJECT_DIR/papers/data-driven"
mv "$PROJECT_DIR/papers/_downloads/2401.12345" "$PROJECT_DIR/papers/data-driven/"
```

---

### Phase 4: 生成报告

创建 `survey/report.md`：
- 调研概要（检索词数、论文数、方向数）
- 各研究方向概述
- Top 10 论文
- 建议阅读顺序

---

## 关键设计

| 原则 | 说明 |
|------|------|
| **增量处理** | 每个检索词独立完成搜索→筛选→下载→写元数据，避免上下文膨胀 |
| **元数据驱动** | 分类基于 `_meta/*.json`，不依赖内存中的大列表 |
| **文件夹即分类** | 聚类结果通过 `papers/{direction}/` 体现，无需额外 JSON |

## Tools

| Tool | Purpose |
|------|---------|
| `arxiv_search` | 搜索论文（无副作用） |
| `arxiv_download` | 下载 .tex/.pdf（需绝对路径） |
