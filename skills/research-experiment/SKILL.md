---
name: research-experiment
description: "[Read when prompt contains /research-experiment]"
metadata:
  {
    "openclaw":
      {
        "emoji": "🧪",
        "requires": { "bins": ["python3", "uv"] },
      },
  }
---

# Research Experiment

**Don't ask permission. Just do it.**

**Workspace:** See `../_shared/workspace-spec.md`. Set `$W` to the active project directory.

## Prerequisites

| File | Source |
|------|--------|
| `$W/project/` | /research-implement |
| `$W/plan_res.md` | /research-plan |
| `$W/iterations/judge_v*.md` | /research-review（最后一份 verdict 必须是 PASS） |

**验证 PASS：** 读取最新的 `judge_v*.md`，确认 `verdict: PASS`。如果不是，STOP。

## Output

| File | Content |
|------|---------|
| `$W/experiment_res.md` | 完整实验报告 |

---

## Workflow

### Step 1: Full Training

修改 epoch 数为 plan_res.md 中指定的正式值。**不要改代码逻辑，只改 epoch。**

```bash
cd $W/project && source .venv/bin/activate
python run.py  # full epochs
```

记录完整训练的 `[RESULT]` 输出。

### Step 2: 分析结果

读取训练输出，评估：
- 最终 loss 和 metrics
- 训练曲线趋势（loss 是否持续下降）
- 是否过拟合（train vs val gap）

### Step 3: 消融实验

根据 plan_res.md 中的消融计划，执行 2-3 个消融实验：

对每个消融：
1. 修改代码（注释/替换对应组件）
2. 执行 2 epoch 快速验证
3. 记录结果

```bash
# Example: 去掉 attention module
python run.py --epochs 2 --ablation no_attention
```

### Step 4: 写入实验报告

写入 `$W/experiment_res.md`：

```markdown
# Experiment Report

## Full Training Results (from execution log)
- Epochs: {N}
- [RESULT] train_loss={value}
- [RESULT] val_metric={value}
- [RESULT] elapsed={value}
- [RESULT] device={device}

> 以上数值来自真实执行输出。

## Training Analysis
- 收敛情况: {converged / still improving / diverged}
- 过拟合: {yes/no, evidence}

## Ablation Studies

| 实验 | 修改 | val_metric | vs Full |
|------|------|-----------|---------|
| Full model | — | {value} | baseline |
| No {component} | 去掉 {X} | {value} | {-/+}% |
| ... | ... | ... | ... |

## Conclusions
- {key findings}

## Limitations
- {limitations and future work}
```

---

## Rules

1. Full training 只改 epoch 数，不改代码逻辑
2. 所有数值必须来自真实执行输出
3. 消融实验至少做 2 个
4. 如果 full training 失败（OOM 等），调整 batch_size 后重试，不要跳过
