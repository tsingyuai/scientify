---
name: metabolism
description: "Knowledge metabolism cycle: ingest new papers, update knowledge state, detect cross-topic links, generate hypotheses. Use /metabolism to trigger manually."
user-invokable: true
---

# Continuous Knowledge Metabolism — Incremental Cycle

你正在执行知识新陈代谢循环。严格按以下步骤执行。

**前提：** `metabolism/config.json` 必须已存在且 `currentDay >= 1`。如果不存在或 `currentDay` 为 0，提示用户先执行 /metabolism-init 完成初始化。

## 准备

1. 读取 `metabolism/config.json` 获取关键词、arXiv 分类、`processed_ids` 和 `currentDay`
2. 读取 `metabolism/knowledge/_index.md` 获取当前知识状态

## Step 1: Search（增量搜索）

用滑动窗口（过去 5 天）搜索，靠 `processed_ids` 去重：

```
arxiv_search({
  query: "{keywords} AND cat:{category}",
  date_from: "{5天前 YYYY-MM-DD}",
  sort_by: "submittedDate",
  max_results: 30
})

openalex_search({
  query: "{keywords}",
  filter: "from_publication_date:{5天前 YYYY-MM-DD}",
  sort: "publication_date",
  max_results: 20
})
```

合并结果，按 arXiv ID / DOI 去重，**跳过 `processed_ids` 中已有的论文**。

下载新论文：

```
arxiv_download({ arxiv_ids: ["{id1}", "{id2}", ...] })
unpaywall_download({ dois: ["{doi1}", "{doi2}", ...] })
```

## Step 2: Read（阅读）

对每篇新论文：
- 读 .tex 源码（优先）或 PDF
- 提取：核心方法、关键结论、与已有知识的关系

将每篇论文的 arXiv ID / DOI 追加到 `config.json` 的 `processed_ids`。

## Step 3: Update Knowledge

读取当前 `metabolism/knowledge/_index.md` 和相关 `topic-*.md`，根据今日阅读的论文更新。

**更新原则：**
- 新发现 → 添加到相关章节
- 印证已有认知 → 补充证据来源
- 与已有认知矛盾 → 标注分歧，保留两方论据
- 跨领域关联 → 记录连接

**篇幅管理：** 每个 topic 文件控制在 200 行以内。接近上限时，压缩早期内容（合并相似结论、删除低价值条目），保留信息密度。不要为了压缩而丢失关键结论和来源引用。

## Step 4: Hypothesize（假设）

更新完 knowledge.md 后，回顾今日新增内容，自问：

- 有没有反复出现但尚未被验证的模式？
- 有没有两个独立发现组合后暗示的新方向？
- 有没有现有方法的明显空白？

**有想法** → 写入 `metabolism/hypotheses/hyp-{NNN}.md`：

```markdown
# Hypothesis {NNN}

## 假设
{一句话}

## 推理过程
{基于哪些论文/知识得出，2-3 段}

## 来源论文
- {arxiv_id}: {title}

## 自评
- 新颖性: {1-5}
- 可行性: {1-5}
- 影响力: {1-5}
```

然后用 `sessions_send` 通知 main session。

**没有想法** → 跳过，不要硬凑。

## Step 5: Log & Finish

写入 `metabolism/log/{YYYY-MM-DD}.md`：

```markdown
# Day {currentDay} — {YYYY-MM-DD}

新论文: {N} 篇
知识更新: {简述主要变更}
假设: {有/无}
```

更新 `config.json`：`currentDay` +1。

## 行为约束

1. 不捏造论文中未出现的事实性声明，但可以用自身知识做推理和关联判断
2. 没有想法时不生成假设
3. 自主运行，不向人类提问
4. 修改知识文件前必须先读取当前内容
