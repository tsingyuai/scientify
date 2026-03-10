# Metabolism SKILL.md — 问题清单

> 基于 SKILL.md 和 metabolism-architecture.md 的审阅，按严重性排序。
>
> **Status (2026-03): historical review notes.**
> Current implementation has converged to unified `knowledge_state` under
> `~/.openclaw/workspace/projects/{project-id}/knowledge_state/`.

## P0: 系统无法正常运行

### 1. Day 1+ 日期过滤几乎总是返回 0 篇论文

**位置**: SKILL.md Step 1a/1b

arXiv submittedDate 有 1-2 天索引延迟，OpenAlex 更慢（3-7 天）。`date_from: "{today}"` 在绝大多数日子返回空结果。系统会连续多天摄入 0 篇，Diff 为空，假设永远不触发。

**修复**: 改用滑动窗口（如过去 3-5 天），配合已处理论文 ID 集合去重。需要在 config.json 或 state 文件中持久化已处理 ID。

### 3. Day 0 的 sessions_spawn 路径传递不明确

**位置**: SKILL.md Step 1 Day 0 模式

spawn task 中没有显式传递工作目录 `$W`，research-collect 依赖 `$W` 参数来决定输出路径。如果 `$W` 解析错误，Day 0 的论文元数据写到错误位置，后续所有步骤断链。

---

## P1: 运行数天后质量退化

### 4. 上下文窗口随天数增长而爆炸

**位置**: SKILL.md Step 2 (Diff)

Step 2 要求读取 knowledge/ 下所有 topic 文件 + 当日 ingest 论文，逐一对比。Day 10+ 时 50 个 topic 文件 + 20-35 篇论文 = 上下文接近极限。Diff 质量会随天数增长持续退化。

**修复**: 分层索引。_index.md 作为可用的压缩摘要（不只是目录），Diff 时先粗筛，只加载相关 topic 文件。

### 5. 假设触发条件需要跨天状态，但无持久化追踪

**位置**: SKILL.md Step 4

触发条件如"连续 3+ 天同一开放问题积累 NEW/REVISE"要求回溯历史 diff。但 SKILL.md 没有指示如何检索和聚合历史 diff 文件。要么读所有历史 diff（上下文爆炸），要么不读（触发条件永远判断不了）。

**修复**: 维护 `metabolism/state/triggers.json`，每次执行后增量更新：
```json
{
  "topic-sae-training": { "consecutive_new_revise_days": 3, "confirm_count_5d": 1 },
  ...
}
```

### 6. Day 0 和 Day 1+ 的文件路径不在同一棵树下

**位置**: SKILL.md Step 1

- Day 0 委托 research-collect，输出到 `papers/_meta/`、`papers/_downloads/`（相对于 research-collect 的 $W）
- Day 1+ 自己执行，但 `arxiv_download` / `unpaywall_download` 调用中没有指定 output_dir
- metabolism 的知识/日志文件在 `metabolism/` 下

两个模式产出的文件结构是否一致？
---

## P2: 长期运行一致性问题

### 7. Topic 粒度未定义

**位置**: SKILL.md Step 3

没有定义 topic 是一篇论文、一组论文、还是一个研究方向。LLM 每次执行可能做出不同粒度的判断：
- 过细 → 几天内达到 50 上限
- 过粗 → 单文件膨胀到上千行
- 不一致 → 同一概念分散在多个文件中

**修复**: 定义粒度标准（如"一个可被 3-5 个关键词标识的研究子方向，预期覆盖 5-20 篇论文"），并给出拆分/合并的量化规则。

### 8. _index.md 的格式和更新规则未定义

**位置**: SKILL.md Step 3 第 155 行

只有一句"更新 _index.md 保持与 topic 文件同步"。没有模板、没有操作语义（加一行链接？重写全文？）。LLM 每次执行生成不同风格的 index，多次执行后 _index.md 与 topic 文件 drift，后续 Diff 基于错误的 index 做判断。

**修复**: 给 _index.md 定义固定模板和原子更新操作（新增 topic 行、更新 topic 摘要、删除 topic 行）。

### 9. 置信度缺乏可操作定义

**位置**: SKILL.md Step 2/3

high/medium/low 三档没有初始值规则、转换规则、REVISE 是否降级。LLM 自由发挥导致标注跨 session 不一致、不可比较。

**修复**: 数值化规则，如 `初始 0.3, CONFIRM +0.15, REVISE -0.2, clamp [0,1]`，或至少定义 `NEW → low, 1x CONFIRM → medium, 2x CONFIRM → high, REVISE → 降一级`。

### 10. Topic 文件更新操作语义模糊

**位置**: SKILL.md Step 3 第 148-154 行

四种 diff 类型到 topic 文件的映射只有自然语言描述（"扩展"、"提升"、"修正"、"添加"），没有精确的操作定义：
- REVISE = 覆盖原结论？追加注释？标记删除线？
- BRIDGE = 添加到哪个 section？topic 模板里没有"跨域连接" section
- NEW = 追加到哪个 section？什么格式？

**修复**: 定义原子操作，如 `NEW → append to ## 已知结论`、`REVISE → 原结论加 ~~删除线~~ + 下方追加修正版本`、`BRIDGE → append to ## 跨域连接（新 section）`。

---

## P3: 边界情况和鲁棒性

### 11. BRIDGE 信号可能导致递归膨胀

**位置**: SKILL.md Step 2 BRIDGE 信号处理

BRIDGE 触发监测带搜索 → 新论文追加到 ingest → 再做一轮 diff。如果新 diff 又产生 BRIDGE，没有限制递归深度。即使不真的无限递归，一次 BRIDGE 也显著增加 token 消耗。

**修复**: 明确限制 BRIDGE 只做一轮扩展，不递归。

### 12. 容量管理（topic 合并）会破坏引用链

**位置**: SKILL.md Step 3 第 175 行

合并低活跃 topic 时，历史 diff 文件和假设文件中的 `topic-xxx.md` 引用全部失效。没有合并日志，知识溯源链断裂。

**修复**: 合并时在被合并 topic 文件中留重定向标记（或更新引用），并记录合并日志。

### 13. 行为约束"不使用参数知识"与实际任务矛盾

**位置**: SKILL.md 行为约束第 1 条

Diff 分类（判断 NEW/CONFIRM/REVISE/BRIDGE）和假设生成必然依赖 LLM 参数知识做推理。这条约束无法被严格遵守，写在那里会导致 LLM 行为不稳定。

**修复**: 改为更精确的表述，如"不使用参数知识引入论文中未出现的事实性声明，但可以使用参数知识做推理和关联判断"。
