<h1 align="center">Scientify</h1>
<p align="center">
  <em>端到端自主演进的 AI 科研系统</em>
</p>

<p align="center">
  <a href="https://scientify.tech">Scientify.tech</a> · <a href="./README.en.md">English</a>
</p>

## 1. 端到端自主研究：持续演进，产出 SOTA 级成果

给 Scientify 一个研究目标，它会自主完成文献调研、假设生成、代码实现、审查和实验验证，并根据结果持续修正研究方向。

Scientify 通过多智能体迭代推进研究。编排器保留研究假设和已有积累，调度独立智能体完成实现、审查和实验。每轮实验的结果都会沉淀为下一轮的经验，让研究沿着更有效的路径持续推进。

### 案例 1：自主发现 KV2 算法，达到领域领先性能

**研究目标**：针对长上下文大语言模型推理，设计一种同时降低首 token 时延和单请求通信量的策略。

Scientify 自主完成文献调研、假设生成、代码实现与消融实验，提出 **KV2 算法**。相较于现有研究，KV2 的首 token 时延第 95 百分位（TTFT p95）和单请求通信量（bytes/request）均有降低，性能达到 **SOTA 水平**。

<p align="center">
  <img src="docs/assets/showcase/1.png" width="80%" alt="Scientify 自主产出的 KV2 算法论文与实验结果">
  <br>
  <sub>Scientify 自主产出的学术论文，呈现 KV2 的设计思路与实验结果</sub>
</p>

<p align="center">
  <img src="docs/assets/showcase/2.png" width="80%" alt="KV2 与现有方法在首 token 时延和通信量上的对比">
  <br>
  <sub>KV2 与现有方法的性能对比</sub>
</p>

### 案例 2：发现黑洞状态转变的三个边界，推导并验证转变条件

Scientify 独立完成理论推导、数值分析和论文撰写，产出 [Equilibrium Gibbs Bifurcations of Bardeen-AdS Black Holes at Fixed Pressure](https://arxiv.org/abs/2606.00099v1)。

**研究问题**：这篇论文研究一种中心被平滑处理的黑洞。当中心平滑区域的尺度增大时，小黑洞和大黑洞还能在同一温度下稳定共存吗？这种共存会在什么条件下消失？

- **从计算中找出三次转变**：Scientify 计算不同中心尺度下的黑洞温度和自由能（用于比较哪种状态更稳定），发现自由能随温度变化的曲线依次呈现燕尾形、8 字形、c 形，最后只剩一条分支，并定位了三次形态转变的位置。
- **建立转变条件的预测模型**：Scientify 推导出，三次转变对应的中心尺度都随热力学压力的增大而缩小：压力增大到 4 倍，转变所需的中心尺度降为一半。它还求出了温度曲线最终只剩一条分支的精确条件，可直接计算给定压力下的这一转变位置。
- **核对预测，识别稳定共存**：Scientify 用三个不同压力下的数值计算核对转变位置，再检查大小黑洞各自是否稳定、自由能是否相等。结果发现，曲线从燕尾形变为 8 字形后，大小黑洞仍可稳定共存；在所检验的 c 形样例中，这种共存已经消失。

## 2. 智能体性能领先：相关论文已被 ICML 2026 录用

Scientify 采用**持续知识新陈代谢**模式：持续跟进前沿文献，将新知识与已有积累关联，并用实验结果修正假设。知识、假设与实验经验在多轮研究中持续保留，支持后续研究不断深入。

我们在 **50 个研究主题、892 条生成假设**上，对照测试了Scientify的持续知识新陈代谢与传统Agent的处理模式。Scientify的假设命中率达到基线的 **1.9 倍**，单主题有效假设数增加 **26%**，Token 成本降低 **92%**。

> **论文已被 ICML 2026 录用。**
>
> [Continuous Knowledge Metabolism: Generating Scientific Hypotheses from Evolving Literature](https://arxiv.org/abs/2604.12243)

<p align="center">
  <img src="docs/assets/showcase/metabolism-vs-batch.zh.svg" width="100%" alt="新陈代谢与批处理的受控研究：50 个主题、892 条假设的关键指标">
</p>

| 指标 | 批处理基线 | 新陈代谢 | 差异 |
|------|-----------|---------|------|
| 命中率：假设方向被后续论文验证的比例 | 3.0% | **5.8%** | **1.9 倍** |
| 单主题有效假设数 | 13.7 | **17.3** | **+26%** |
| LLM 评判的新颖性（1–10 分制） | 6.39 | **6.82** | **+0.43** |
| 单条假设的 Token 成本 | 434K | **30K** | **降低 92%** |

## 3. 如何使用

前往 **[Scientify.tech](https://scientify.tech)**，注册或登录后，在工作区输入你的研究目标即可开始。

Scientify 在隔离云电脑中持续执行研究任务，文献、代码、数据和实验结果保存在同一工作区。关闭电脑后任务继续运行，你可以随时从手机或其他设备查看进度、补充材料并继续研究。
