---
name: metabolism
description: "Knowledge metabolism: Day 0 init (discuss + baseline survey) or daily cycle (incremental search + update knowledge + generate hypotheses). Triggered by bootstrap and daily cron."
---

# Knowledge Metabolism

读取 `config.json` 的 `currentDay` 字段判断执行哪个分支：

- **`currentDay == 0` 或 config.json 不存在** → 执行 Day 0（初始化）
- **`currentDay >= 1`** → 执行每日增量循环

---

## Day 0：初始化

与用户讨论研究方向后，构建领域基线知识。

### 准备

1. 检查 `config.json` 是否存在
   - 不存在：询问用户研究方向，创建 `config.json`（包含 `keywords`, `arxivCategories`, `sources`, `currentDay: 0`, `processed_ids: []`）
   - 已存在且 `currentDay > 0`：跳转到每日循环

### Step 1: 宽泛调研

委托 /research-collect 执行宽泛调研（不限日期），构建初始知识：

```
sessions_spawn({
  task: "/research-collect\n研究主题: {从 config.json 的 keywords 提取}\n这是 Day 0 基线构建，请做宽泛调研（不限日期），覆盖领域经典工作和近期进展。",
  label: "Day 0 Baseline Survey",
  runTimeoutSeconds: 1800
})
```

等待完成后，读取 `papers/` 获取论文列表。

### Step 2: 阅读与知识提取

对每篇论文：
- 读 .tex 源码（优先）或 PDF
- 提取：核心方法、关键结论、领域现状

将每篇论文的 arXiv ID / DOI 追加到 `config.json` 的 `processed_ids`。

### Step 3: 构建初始知识状态

创建 `knowledge/_index.md`：
- Research Goal（从 config.json 提取）
- Topics 表格（按论文主题聚类）
- Cross-topic Links（如有）
- Timeline（记录 Day 0）

为每个识别出的主题创建 `knowledge/topic-{name}.md`：
- 已知方法
- 关键论文与结论
- 开放问题

### Step 4: 记录日志

写入 `log/{YYYY-MM-DD}-init.md`，更新 `config.json`：`currentDay` 设为 1。

---

## Day 1+：每日增量循环

### 准备

1. 读取 `config.json` 获取关键词、arXiv 分类、`sources`、`processed_ids` 和 `currentDay`
2. 读取 `knowledge/_index.md` 获取当前知识状态

### Step 1: Search（增量搜索）

根据 `config.json` 的 `sources` 字段选择搜索来源，用滑动窗口（过去 5 天）搜索，靠 `processed_ids` 去重：

**arXiv**（如果 sources 包含 "arxiv"）：
```
arxiv_search({
  query: "{keywords} AND cat:{category}",
  date_from: "{5天前 YYYY-MM-DD}",
  sort_by: "submittedDate",
  max_results: 30
})
```

**OpenAlex**（如果 sources 包含 "openalex"）：
```
openalex_search({
  query: "{keywords}",
  filter: "from_publication_date:{5天前 YYYY-MM-DD}",
  sort: "publication_date",
  max_results: 20
})
```

合并结果，按 arXiv ID / DOI 去重，**跳过 `processed_ids` 中已有的论文**。

使用 `paper_download` 工具下载新论文到 `papers/`（arXiv 优先 .tex 源文件，DOI 通过 Unpaywall 获取 OA PDF）。

### Step 2: Read（阅读）

对每篇新论文：
- 读 .tex 源码（优先）或 PDF
- 提取：核心方法、关键结论、与已有知识的关系

将每篇论文的 arXiv ID / DOI 追加到 `config.json` 的 `processed_ids`。

### Step 3: Update Knowledge

读取当前 `knowledge/_index.md` 和相关 `topic-*.md`，根据今日阅读的论文更新。

**更新原则：**
- 新发现 → 添加到相关章节
- 印证已有认知 → 补充证据来源
- 与已有认知矛盾 → 标注分歧，保留两方论据
- 跨领域关联 → 记录连接

**篇幅管理：** 每个 topic 文件控制在 200 行以内。接近上限时，压缩早期内容（合并相似结论、删除低价值条目），保留信息密度。不要为了压缩而丢失关键结论和来源引用。

### Step 4: Hypothesize（假设）

更新完知识后，回顾今日新增内容，自问：

- 有没有反复出现但尚未被验证的模式？
- 有没有两个独立发现组合后暗示的新方向？
- 有没有现有方法的明显空白？

**有想法** → 写入 `ideas/hyp-{NNN}.md`：

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

### Step 5: Log & Finish

写入 `log/{YYYY-MM-DD}.md`，更新 `config.json`：`currentDay` +1。

---

## 行为约束

1. 不捏造论文中未出现的事实性声明，但可以用自身知识做推理和关联判断
2. 没有想法时不生成假设
3. 自主运行，不向人类提问（Day 0 初始配置除外）
4. 修改知识文件前必须先读取当前内容
