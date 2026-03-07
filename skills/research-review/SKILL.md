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

**Workspace:** `$W` = working directory provided in task parameter.

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

### Step 2: 提取原子性概念清单

**⚠️ 这是 Novix Judge Agent 的核心机制 — 逐一核对每个原子性学术概念。**

从 `$W/survey_res.md` 的"关键公式汇总"和"核心方法对比"中，提取所有需要在代码中实现的**原子性学术概念**（每个公式、每个核心组件都是一个概念）。

为每个概念记录：
- 概念名称（如 "Multi-Head Attention", "Contrastive Loss", "Batch Normalization"）
- 对应公式（LaTeX 格式）
- 预期代码位置（根据 plan_res.md 推断）

示例清单：
```
原子性概念清单（从 survey_res.md 提取）：
1. Multi-Head Attention — $Attention(Q,K,V) = softmax(\frac{QK^T}{\sqrt{d_k}})V$ — 预期在 model/attention.py
2. Layer Normalization — $LN(x) = \gamma \frac{x - \mu}{\sigma} + \beta$ — 预期在 model/layers.py
3. Residual Connection — $y = F(x) + x$ — 预期贯穿所有模型组件
...
```

### Step 3: 逐项检查

#### A. 数据集真实性审查

| 检查项 | 方法 |
|--------|------|
| 数据集是否真实拉取 | 检查 `data/` 目录下是否有实际数据文件（非空文件），检查下载脚本/代码是否真正执行了网络请求或本地读取 |
| 数据加载代码正确性 | 实际执行数据加载代码，验证 shape、dtype、样本数是否与 plan 一致：`python3 -c "from data.dataset import *; ds = ...; print(len(ds), ds[0])"` |
| Mock 数据标注 | 搜索 `# MOCK DATA` 注释；如果使用 mock 数据但未声明，标记为 NEEDS_REVISION |

#### B. 算法实现审查

| 检查项 | 方法 |
|--------|------|
| **原子性概念逐一核对** | **对照 Step 2 的概念清单，逐个检查**：该概念是否在代码中有对应实现？公式翻译是否正确？维度/参数是否一致？每个概念标注 ✓ 或 ✗ 并记录代码位置 |
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

#### D. 性能初步评估

**⚠️ 关键新增 — 防止"代码正确但效果很差"的算法被放行。**

从 `ml_res.md` 提取 2 epoch 验证结果，评估算法有效性：

| 检查项 | 判定标准 | 诊断 |
|--------|----------|------|
| **Loss 下降幅度** | 计算 `reduction = (epoch1_loss - epoch2_loss) / epoch1_loss * 100%` | <5% → 可能学习率过小、架构有问题或数据未正确处理 |
| **Loss 稳定性** | 检查 epoch 1 和 epoch 2 的 loss 波动 | 震荡 >20% → 可能学习率过大或 batch size 不当 |
| **Metrics 合理性** | 对比任务的随机 baseline（分类: 1/num_classes，回归: 数据方差） | 接近随机（±10%）→ 模型未真正学习，可能特征无效或架构过简单 |
| **与 plan 预期对比** | 如果 plan_res.md 中有性能预期，对比实际结果 | 低于预期 30% → 需要反思算法设计或超参数设置 |

**性能异常的常见原因**：

| 症状 | 可能原因 | 验证方法 |
|------|----------|----------|
| Loss 几乎不变（<2%） | 学习率过小 | 检查 plan_res.md 中 lr 值，对比 survey_res.md 中 baseline lr |
| Loss 震荡剧烈（>30%） | 学习率过大 | 同上 |
| Loss 下降但 metric 不变 | 模型过简单或特征无效 | 检查模型参数量；检查数据预处理是否正确（归一化、标准化） |
| Accuracy 接近随机 | 数据标签错误或未正确加载 | 重新验证数据加载代码，打印样本检查 |
| Loss=NaN/Inf | 梯度爆炸、数值不稳定 | 检查是否有 Batch/Layer Normalization；检查 lr 是否过大 |

**如果发现性能异常，标记 `verdict: NEEDS_ALGORITHM_REVIEW`（不同于 NEEDS_REVISION）。**

### Step 4: 写入审查报告

写入 `$W/iterations/judge_v1.md`：

```markdown
# Review v1

## Verdict: PASS / NEEDS_REVISION / NEEDS_ALGORITHM_REVIEW

## Checklist

### 数据集
- [x/✗] Dataset actually downloaded/loaded (not empty or placeholder)
- [x/✗] Data loading code produces correct shape/dtype/count
- [x/✗] No undeclared mock data

### 算法实现 - 原子性概念核对

**逐一核对 Step 2 提取的每个学术概念：**

| 概念 | 公式 | 代码位置 | 结果 | 备注 |
|------|------|----------|------|------|
| {概念名} | $...$ | `model/xxx.py:L42` | ✓/✗ | {正确实现/公式错误/缺失/简化为占位符} |
| ... | ... | ... | ... | ... |

### 算法实现 - 整体检查
- [x/✗] Loss function correctly implements the math
- [x/✗] Key algorithm components fully implemented (no simplified placeholders)
- [x/✗] Evaluation metrics correct

### 算力与执行
- [x/✗] Execution time reasonable for data scale + model size + device
- [x/✗] Training loop proper (loss decreasing)
- [x/✗] Results are from real execution (not fabricated)

### 性能初步评估（新增）

**2-Epoch Validation Results** (from `ml_res.md`):
- Epoch 1 loss: {value}
- Epoch 2 loss: {value}
- Loss reduction: {percent}% (expected: >10% for initial epochs)
- Metric (e.g., accuracy): {value} (random baseline: {baseline_value})

**Performance Assessment**:
- [x/✗] Loss decreasing adequately (reduction >5%)
- [x/✗] Metrics above random baseline (+10% or more)
- [x/✗] No severe oscillation (<20% variance)
- [x/✗] Meets plan expectations (if performance target specified in plan_res.md)

**Diagnosis** (if performance issues):
- **Symptom**: {what's wrong - e.g., "Loss reduction only 0.9%, far below 10% expected"}
- **Likely cause**: {diagnosis - e.g., "Learning rate too small (lr=1e-5, survey baseline=1e-3)"}
- **Evidence**: {supporting evidence - e.g., "survey_res.md Table 2 shows all baselines use lr=1e-3"}

## Issues (if NEEDS_REVISION)
1. **{issue}**: {description} → **Fix**: {specific fix instruction}
2. ...

## Algorithm Review Suggestions (if NEEDS_ALGORITHM_REVIEW)

**按优先级排序的改进建议**（只调整超参数/训练配置，不改核心算法）：

1. **{建议名称}**（最可能有效）
   - **What to change**: {具体修改内容}
   - **Where**: {文件路径和代码位置}
   - **Expected improvement**: {预期效果}

2. **{次要建议}**
   - ...

**Note**: 如果尝试所有建议后仍无改善，可能需要重新考虑算法选择或数据质量。
```

### Step 5a: 代码修复迭代（如果 NEEDS_REVISION）

**⚠️ 防偏移机制：每轮迭代都重新读取原始设计文档，确保修改方向正确。**

循环最多 3 次：

1. 读取 `judge_v{N}.md` 的修改建议
2. **防偏移检查：重新读取** `$W/survey_res.md` 和 `$W/plan_res.md`
   - 对照原始学术设计目标
   - 确保修改不是为了"绕过审查"而偏离学术严谨性
   - 确认修改符合 survey 中的公式定义和 plan 中的设计意图
3. 修改 `$W/project/` 中的代码（修复 bug、补全缺失实现）
4. 重新执行：
   ```bash
   cd $W/project && source .venv/bin/activate && python3 run.py --epochs 2
   ```
5. 读取执行输出，验证修复
6. **重新执行 Step 2-4**（提取概念清单 → 逐项检查 → 写报告），写入 `judge_v{N+1}.md`
7. 如果 PASS 或 NEEDS_ALGORITHM_REVIEW → 停止；否则继续

### Step 5b: 算法反思与调优（如果 NEEDS_ALGORITHM_REVIEW）

**⚠️ 关键新增 — 代码正确但性能不佳时的改进循环。**

**前提**：代码实现正确（所有原子性概念 ✓），但 2 epoch 验证显示性能异常。

循环最多 **2 次**：

#### 5b.1 性能诊断

重新读取以下材料进行诊断：
- `$W/ml_res.md` — 2 epoch 验证的具体数值
- `$W/survey_res.md` — baseline 方法的超参数设置（特别是学习率、batch size）
- `$W/plan_res.md` — 当前实现的超参数配置
- `$W/project/run.py` 和 `$W/project/training/` — 训练配置代码

**诊断检查清单**：

| 症状 | 诊断步骤 | 常见原因 |
|------|----------|----------|
| Loss 下降 <5% | 对比 plan lr vs survey baseline lr | lr 过小（如 plan=1e-5 但 survey=1e-3） |
| Loss 震荡 >20% | 同上 + 检查 batch size | lr 过大或 batch size 过小 |
| Accuracy 接近随机 | 检查数据预处理代码、检查 loss 是否下降 | 数据归一化缺失、特征错误、模型过简单 |
| Loss=NaN/Inf | 检查是否有 normalization、检查 lr | 梯度爆炸、数值不稳定 |

#### 5b.2 生成改进建议

基于诊断结果，生成**按优先级排序**的改进建议。

**改进范围限制**：
- ✅ 允许：调整超参数（lr、batch size、epochs、optimizer、scheduler）
- ✅ 允许：修改训练配置（添加 warmup、gradient clipping、weight decay）
- ✅ 允许：修复数据预处理问题（添加归一化、标准化）
- ❌ 禁止：修改核心算法逻辑（模型架构、loss 函数数学公式）

**建议格式**（写入 `judge_v{N}.md` 的 "Algorithm Review Suggestions" 部分）：

```markdown
1. **调整学习率**（优先级：高，预期改善：显著）
   - **当前值**: lr=1e-5 (from plan_res.md)
   - **建议值**: lr=1e-3 (from survey_res.md Table 2, all baselines use 1e-3)
   - **修改位置**: `$W/project/run.py:L15` — `optimizer = Adam(lr=1e-3)`
   - **理由**: Loss 下降仅 0.9%，远低于正常 10%+，高度怀疑 lr 过小

2. **添加数据归一化**（优先级：中，预期改善：中等）
   - **检查**: `$W/project/data/dataset.py` 是否有归一化
   - **建议**: 添加 `transforms.Normalize(mean=[0.5], std=[0.5])`
   - **理由**: 如果输入数据范围 [0,255]，模型收敛会很慢
```

#### 5b.3 执行改进并验证

1. 根据建议**逐项尝试**（从优先级高的开始）
2. 每次修改后：
   ```bash
   cd $W/project && source .venv/bin/activate && python3 run.py --epochs 2
   ```
3. 读取新的执行输出，对比改进前后：
   - Loss reduction 是否提升？（如 0.9% → 12%）
   - Metrics 是否改善？（如 accuracy 12% → 34%）
4. 记录每次尝试的结果到 `judge_v{N+1}.md` 的 "Algorithm Review Iterations" 部分：

```markdown
## Algorithm Review Iterations

### Iteration 1
- **Change**: Increased lr from 1e-5 to 1e-3
- **Result**:
  - Loss reduction: 0.9% → 12.3% ✓ (improvement: +11.4%)
  - Accuracy: 12% → 34% ✓ (improvement: +22%)
- **Conclusion**: Learning rate was the bottleneck. Issue resolved.
- **New verdict**: PASS ✓

### Iteration 2 (if needed)
- ...
```

#### 5b.4 判定

- **改善显著**（loss reduction 提升 >5%）→ `verdict: PASS`，停止
- **改善微小**（<2%）→ 继续下一个建议或下一轮
- **2 轮后仍无改善** → `verdict: BLOCKED`，标注原因（如"所有超参数调整均无效，可能需要重新选择算法或检查数据质量"）

---

**Step 5a vs 5b 的区别**：

| | Step 5a (NEEDS_REVISION) | Step 5b (NEEDS_ALGORITHM_REVIEW) |
|---|---|---|
| 触发条件 | 代码有 bug、实现错误 | 代码正确但性能不佳 |
| 修改范围 | 核心算法代码 | 超参数和训练配置 |
| 迭代次数 | 3 次 | 2 次 |
| 目标 | 正确性 | 有效性 |

### Step 6: 最终判定

**终止条件**：

| 场景 | 判定 | 说明 |
|------|------|------|
| 所有 checklist ✓ + 性能合理 | `PASS` | 交付给 research-experiment |
| Step 5a 3 轮后仍有 bug | `BLOCKED - Code Issues` | 列出剩余问题，等待用户介入 |
| Step 5b 2 轮后性能仍异常 | `BLOCKED - Performance Issues` | 标注尝试过的改进和结果，建议用户重新考虑算法选择或数据质量 |

---

## Rules

### 审查标准

1. 审查必须逐项对照 plan，不能只看"代码能跑"
2. 每个 issue 必须给出具体的修复指令（不是"请改进"）
3. 验证修复后必须重新执行代码并检查输出
4. **PASS 的前提**：所有 checklist 项通过 + 性能初步评估合理（不仅仅是"有下降"）
5. **数据集必须验证真实性** —— 实际执行数据加载代码，确认有真实数据（哪怕是小规模）；纯随机 tensor 不算
6. **执行时间必须与算力匹配** —— 2 epoch 训练时间过短（数据量 >1000 却 <2s）说明数据未加载或训练是空循环
7. **算法实现必须完整** —— plan 中标注的核心创新点必须逐一检查，不能被简化为 `nn.Linear` 占位
8. **原子性概念逐一核对（Novix Judge 机制）** —— Step 2 提取的每个概念都必须在 judge 报告的表格中有对应行，标注 ✓ 或 ✗
9. **防偏移（每轮迭代必须重新对齐）** —— Step 5a/5b 每轮修改前必须重新读取 survey_res.md 和 plan_res.md，确保不偏离原始设计目标

### 性能评估（新增）

10. **性能初步评估是强制项** —— Step 3D 必须执行，不能跳过
11. **Loss 下降幅度有最低要求** —— 2 epoch 验证的 loss reduction <5% 必须标记为性能异常
12. **Metrics 必须超过随机 baseline** —— 分类任务 accuracy 接近 1/num_classes（±10%）视为"模型未学习"
13. **性能异常触发算法反思** —— 代码正确但性能不佳时，必须进入 Step 5b 尝试调优，不能直接 PASS

### 算法反思（新增）

14. **Step 5b 只调超参数，不改算法** —— 禁止修改核心算法逻辑、模型架构、loss 函数公式
15. **改进建议必须有依据** —— 每个建议必须引用 survey_res.md 或 plan_res.md 中的具体内容
16. **改进效果必须量化** —— 每次尝试后必须记录改善幅度（如 "loss reduction +11.4%"），不能只说"有改善"
17. **2 轮算法反思后仍无改善视为 BLOCKED** —— 标注原因并建议用户介入（如"可能需要更换算法或检查数据质量"）
