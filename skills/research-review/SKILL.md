---
name: research-review
description: "[Read when prompt contains /research-review]"
metadata:
  {
    "openclaw":
      {
        "emoji": "🔍",
        "requires": { "bins": ["python3", "uv"] },
      },
  }
---

# Research Review

**Don't ask permission. Just do it.**

**Workspace:** See `../_shared/workspace-spec.md`. Set `$W` to the active project directory.

## Prerequisites

| File | Source |
|------|--------|
| `$W/ml_res.md` | /research-implement |
| `$W/project/` | /research-implement |
| `$W/plan_res.md` | /research-plan |
| `$W/survey_res.md` | /research-survey |

**If `ml_res.md` is missing, STOP:** "需要先运行 /research-implement 完成代码实现"

## Output

| File | Content |
|------|---------|
| `$W/iterations/judge_v{N}.md` | 每轮审查报告 |

最终报告中 `verdict: PASS` 表示审查通过。

---

## Workflow

### Step 1: 审查代码

读取以下内容：
- `$W/plan_res.md` — 每个组件的预期
- `$W/survey_res.md` — 核心公式
- `$W/project/` — 实际代码
- `$W/ml_res.md` — 执行结果

### Step 2: 逐项检查

#### A. 数据集真实性审查

| 检查项 | 方法 |
|--------|------|
| 数据集是否真实拉取 | 检查 `data/` 目录下是否有实际数据文件（非空文件），检查下载脚本/代码是否真正执行了网络请求或本地读取 |
| 数据加载代码正确性 | 实际执行数据加载代码，验证 shape、dtype、样本数是否与 plan 一致：`python -c "from data.dataset import *; ds = ...; print(len(ds), ds[0])"` |
| Mock 数据标注 | 搜索 `# MOCK DATA` 注释；如果使用 mock 数据但未声明，标记为 NEEDS_REVISION |

#### B. 算法实现审查

| 检查项 | 方法 |
|--------|------|
| 模型架构匹配公式 | 逐层对比 survey_res.md 中的核心公式 vs `model/` 实现，检查维度变换、激活函数、注意力机制等关键细节 |
| Loss 函数正确 | 对比 plan Training Plan vs `training/loss.py`，验证数学公式是否正确翻译为代码 |
| 评估指标正确 | 对比 plan Testing Plan vs `testing/`，确认指标计算逻辑无误 |
| 关键算法未被简化 | 检查 plan 中的核心创新点是否被完整实现，而非用简化/占位逻辑替代 |

#### C. 算力与执行合理性审查

| 检查项 | 方法 |
|--------|------|
| 执行用时合理 | 读取 ml_res.md 中 `[RESULT] elapsed=` 值，根据数据集规模 + 模型参数量 + 设备（CPU/GPU）判断用时是否合理。过短（如万级数据集 <1s）可能说明数据未真正加载或训练未真正执行 |
| [RESULT] 行存在 | 检查 ml_res.md 中的数值来源，确认非编造 |
| Loss 合理 | 非 NaN/Inf，有下降趋势（epoch 1 loss > epoch 2 loss） |
| 数据管道匹配 plan | 对比 plan Dataset Plan vs `data/` 实现，batch size、预处理步骤一致 |

### Step 3: 写入审查报告

写入 `$W/iterations/judge_v1.md`：

```markdown
# Review v1

## Verdict: PASS / NEEDS_REVISION

## Checklist

### 数据集
- [x/✗] Dataset actually downloaded/loaded (not empty or placeholder)
- [x/✗] Data loading code produces correct shape/dtype/count
- [x/✗] No undeclared mock data

### 算法实现
- [x/✗] Model architecture matches survey formulas
- [x/✗] Loss function correctly implements the math
- [x/✗] Key algorithm components fully implemented (no simplified placeholders)
- [x/✗] Evaluation metrics correct

### 算力与执行
- [x/✗] Execution time reasonable for data scale + model size + device
- [x/✗] Training loop proper (loss decreasing)
- [x/✗] Results are from real execution (not fabricated)

## Issues (if NEEDS_REVISION)
1. **{issue}**: {description} → **Fix**: {specific fix instruction}
2. ...
```

### Step 4: 迭代（如果 NEEDS_REVISION）

循环最多 3 次：

1. 读取 `judge_v{N}.md` 的修改建议
2. 修改 `$W/project/` 中的代码
3. 重新执行：
   ```bash
   cd $W/project && source .venv/bin/activate && python run.py --epochs 2
   ```
4. 读取执行输出，验证修复
5. 写入 `judge_v{N+1}.md`
6. 如果 PASS → 停止；否则继续

### Step 5: 最终判定

3 轮后仍 NEEDS_REVISION → 在最后一份 judge 中列出剩余问题，标记 `verdict: BLOCKED`，等待用户介入。

---

## Rules

1. 审查必须逐项对照 plan，不能只看"代码能跑"
2. 每个 issue 必须给出具体的修复指令（不是"请改进"）
3. 验证修复后必须重新执行代码并检查输出
4. PASS 的前提：所有 checklist 项通过 + [RESULT] 数值合理
5. **数据集必须验证真实性** —— 实际执行数据加载代码，确认有真实数据（哪怕是小规模）；纯随机 tensor 不算
6. **执行时间必须与算力匹配** —— 2 epoch 训练时间过短（数据量 >1000 却 <2s）说明数据未加载或训练是空循环
7. **算法实现必须完整** —— plan 中标注的核心创新点必须逐一检查，不能被简化为 `nn.Linear` 占位
