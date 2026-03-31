---
name: research-collect
description: "[Read when prompt contains /research-collect]"
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
├── papers/
│   ├── {arxiv_id}/             # arXiv 论文源文件
│   ├── {doi_slug}.pdf          # DOI 论文 PDF
│   └── {direction}/            # 整理后的分类目录
├── repos/                      # 参考代码仓库（Phase 3）
└── survey_report.md            # 调研报告
```

---

## Workflow

### Phase 1: 准备

```bash
mkdir -p "papers"
```

生成 4-8 个检索词。

---

### Phase 2: 增量搜索-筛选-下载（循环）

**对每个检索词重复以下步骤**：

#### 2.1 搜索

```
arxiv_search({ query: "<term>", max_results: 30 })
openalex_search({ query: "<term>", max_results: 20 })
```

合并两个来源的结果，按 arXiv ID / DOI 去重。

#### 2.2 筛选

只看**相关性**——这篇论文是否和研究主题直接相关？

- **相关**：直接研究该主题，或提出了可借鉴的方法 → 保留
- **不相关**：主题偏离，仅在关键词上有交集 → 跳过

#### 2.3 下载论文

使用 `paper_download` 工具下载论文到 `papers/`。

**完成一个检索词后，再进行下一个。** 这样避免上下文被大量搜索结果污染。

---

### Phase 3: GitHub 代码搜索与参考仓库选择

**目标**：为下游 skill（research-survey、research-plan、research-implement）提供可参考的开源实现。

#### 3.1 选择论文

从 `papers/` 中选出 **Top 5** 最相关论文。

#### 3.2 搜索参考仓库

对每篇选中论文，用以下关键词组合搜索 GitHub 仓库：
- 论文标题 + "code" / "implementation"
- 核心方法名 + 作者名
- 论文中提到的数据集名 + 任务名

```bash
gh search repos "{paper_title} implementation" --limit 10 --sort stars --language python
```

#### 3.3 筛选与 clone

选择 **3-5 个**最相关的仓库：

```bash
mkdir -p "repos"
git clone --depth 1 <repo_url> "repos/{name}"
```

**如果搜不到相关仓库**，跳过本阶段。

---

### Phase 4: 分类整理

所有检索词完毕后：

#### 4.1 聚类分析

根据已下载论文的标题和摘要，识别 3-6 个研究方向。

#### 4.2 创建分类目录

```bash
mkdir -p "papers/{direction}"
mv "papers/2401.12345" "papers/data-driven/"
```

---

### Phase 5: 生成报告

创建 `survey_report.md`：
- 调研概要（检索词数、论文数、方向数）
- 各研究方向概述
- Top 10 论文（标题 + ID + 一句话价值）
- 参考仓库摘要（如有）
- 建议阅读顺序

---

## 关键设计

| 原则 | 说明 |
|------|------|
| **增量处理** | 每个检索词独立完成搜索→筛选→下载，避免上下文膨胀 |
| **文件夹即分类** | 聚类结果通过 `papers/{direction}/` 体现 |

## Tools / Commands

| Tool / Command | Purpose |
|----------------|---------|
| `arxiv_search` | 搜索 arXiv 论文 |
| `openalex_search` | 搜索跨学科论文（覆盖更广） |
| paper_download | 下载论文（arXiv .tex/PDF、DOI via Unpaywall） |
| `gh search repos "query"` | 搜索 GitHub 仓库 |
