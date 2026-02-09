---
name: research-implement
description: "[Read when prompt contains /research-implement]"
metadata:
  {
    "openclaw":
      {
        "emoji": "💻",
        "requires": { "bins": ["python3", "uv"] },
      },
  }
---

# Research Implement

**Don't ask permission. Just do it.**

**Workspace:** See `../_shared/workspace-spec.md`. Set `$W` to the active project directory.

## Prerequisites

| File | Source |
|------|--------|
| `$W/plan_res.md` | /research-plan |
| `$W/survey_res.md` | /research-survey |
| `$W/repos/` (optional) | reference code |

**If `plan_res.md` is missing, STOP:** "需要先运行 /research-plan 完成实现计划"

## Output

| File | Content |
|------|---------|
| `$W/project/` | 完整可运行代码 |
| `$W/ml_res.md` | 实现报告（含真实执行结果） |

---

## Workflow

### Step 1: 读取计划

读取 `$W/plan_res.md`，提取：
- 所有组件列表
- 数据集信息
- 训练参数

### Step 2: 创建项目结构

```
$W/project/
  model/          # 模型组件（每个组件一个文件）
  data/           # 数据加载
  training/       # 训练循环 + loss
  testing/        # 评估
  utils/          # 工具函数
  run.py          # 入口（必须输出 [RESULT] 行）
  requirements.txt
```

### Step 3: 实现代码

按此顺序实现（每步完成后立即验证）：

**3a. requirements.txt** — 列出所有依赖，pin 主版本

**3b. 数据管道**
```bash
cd $W/project && uv venv .venv && source .venv/bin/activate
uv pip install -r requirements.txt
python -c "from data.dataset import *; print('data OK')"
```
验证：import 无报错

**3c. 模型架构**
```bash
python -c "from model import *; import torch; x = torch.randn(2, ...); print(model(x).shape)"
```
验证：输出 shape 正确

**3d. Loss + 训练循环**

**3e. 评估逻辑**

**3f. run.py** — 必须包含：
```python
print(f"[RESULT] train_loss={train_loss:.6f}")
print(f"[RESULT] val_metric={val_metric:.6f}")
print(f"[RESULT] elapsed={elapsed:.1f}s")
print(f"[RESULT] device={device}")
```

### Step 4: 环境搭建 + 执行

```bash
cd $W/project
uv venv .venv
source .venv/bin/activate

# 自动检测依赖格式
if [ -f "pyproject.toml" ]; then
    uv pip install -e .
elif [ -f "requirements.txt" ]; then
    uv pip install -r requirements.txt
fi

# 2 epoch 验证
python run.py --epochs 2
```

### Step 5: 验证执行结果

**执行完成后，必须：**

1. 读取 stdout/stderr 完整输出
2. 确认存在 `[RESULT]` 行
3. 确认 loss 非 NaN/Inf
4. 确认 loss 有下降趋势（即使微小）

**如果执行失败：**
- 读取报错信息
- 修复代码
- 重新执行
- 最多重试 3 次

### Step 6: 写入报告

写入 `$W/ml_res.md`：

```markdown
# Implementation Report

## Data Source
- Dataset: {name} — real / mock (reason)
- If mock: steps to obtain real data: [...]

## Components Implemented
- {module}: {description}

## Quick Validation Results (from execution log)
- Epochs: 2
- [RESULT] train_loss={从执行输出中复制}
- [RESULT] val_metric={从执行输出中复制}
- [RESULT] elapsed={从执行输出中复制}
- [RESULT] device={从执行输出中复制}

> 以上数值直接引用自代码执行输出。
> 如任何数值无法从执行日志中验证，标注为 ⚠️ UNVERIFIED。

## Deviations from Plan
- {changes and why}

## Known Issues
- {issues}
```

---

## Critical Rules

1. **禁止编造结果。** 所有数值必须来自代码执行输出。执行失败就报告失败。
2. **禁止使用全局 pip。** 必须用 uv venv 隔离。
3. **禁止直接 import repos/**，必须改写适配。
4. **mock 数据必须标注** — 代码中 `# MOCK DATA: <reason>`，报告中声明。
5. **run.py 必须输出 `[RESULT]` 行**，报告必须引用这些输出。
6. 3 次重试后仍失败，写入失败报告并停止。
