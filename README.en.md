<h1 align="center">Scientify</h1>
<p align="center">
  <em>End-to-End AI Research That Continuously Evolves</em>
</p>

<p align="center">
  <a href="https://scientify.tech">Scientify.tech</a> · <a href="./README.md">中文</a>
</p>

## 1. End-to-End Autonomous Research: Continuous Iteration, SOTA-Level Results

Give Scientify a research objective. It autonomously surveys the literature, generates hypotheses, implements code, reviews the implementation, and runs experiments, then refines the research direction based on the results.

Scientify advances research through multi-agent iteration. An orchestrator retains the hypotheses and accumulated knowledge, coordinating independent agents for implementation, review, and experimentation. Each round contributes experience to the next, helping the research progress along more effective paths.

### Case Study 1: Autonomously Discovering KV2 with Field-Leading Performance

**Research objective**: Design a strategy for long-context LLM inference that reduces both time to first token and communication volume per request.

Scientify autonomously completed the literature survey, hypothesis generation, code implementation, and ablation experiments to propose the **KV2 algorithm**. Compared with existing research, KV2 reduced both the 95th percentile of time to first token (TTFT p95) and communication volume per request (bytes/request), achieving **SOTA-level performance**.

<p align="center">
  <img src="docs/assets/showcase/1.png" width="80%" alt="KV2 paper and experimental results produced autonomously by Scientify">
  <br>
  <sub>A paper autonomously produced by Scientify, presenting the KV2 design and experimental results</sub>
</p>

<p align="center">
  <img src="docs/assets/showcase/2.png" width="80%" alt="KV2 comparison with existing methods on time to first token and communication volume">
  <br>
  <sub>KV2 performance compared with existing methods</sub>
</p>

### Case Study 2: Independently Producing a Black-Hole Thermodynamics Paper on Gibbs Bifurcations

Scientify independently performed the theoretical derivations, numerical analysis, and manuscript preparation for [Equilibrium Gibbs Bifurcations of Bardeen-AdS Black Holes at Fixed Pressure](https://arxiv.org/abs/2606.00099v1).

**Research question**: At fixed pressure, how do black-hole free-energy curves and stable phases evolve as the regularization scale that removes the central singularity increases?

- **Model contribution**: A fixed-pressure Gibbs bifurcation framework for four-dimensional Bardeen-AdS black holes under the direct horizon thermodynamic convention, with $G=M-TS$. Turning-point and self-intersection classification, positive-heat-capacity filtering, and the lower free-energy envelope over stable branches connect curve topology, local stability, and equilibrium phase selection.
- **Theoretical contribution**: Reduction of pressure $P$ and regularization scale $g$ to a single control parameter, $\lambda=8\pi Pg^2$, deriving $g_i(P)\propto P^{-1/2}$ for all three bifurcation boundaries and the exact final single-branch threshold $\lambda_s=73/48-13\sqrt{273}/144$.
- **Physical finding**: Analytical and numerical results resolve the sequence from an RN-AdS-like swallow-tail through 8-shaped and c-shaped curves to a single branch. Stable small/large black-hole coexistence survives the first topology change; the representative c-shaped case has no stable coexistence crossing.

## 2. Leading Agent Performance: Related Paper Accepted at ICML 2026

Scientify uses **continuous knowledge metabolism**: it follows emerging literature, connects new findings with accumulated knowledge, and refines hypotheses using experimental results. Knowledge, hypotheses, and experimental experience persist across research rounds, enabling deeper investigation over time.

We compared Scientify's continuous knowledge metabolism with the processing approach of traditional agents across **50 research topics and 892 generated hypotheses**. Scientify achieved **1.9 times** the baseline hypothesis hit rate, generated **26% more** useful hypotheses per topic, and reduced Token costs by **92%**.

> **The paper has been accepted at ICML 2026.**
>
> [Continuous Knowledge Metabolism: Generating Scientific Hypotheses from Evolving Literature](https://arxiv.org/abs/2604.12243)

<p align="center">
  <img src="docs/assets/showcase/metabolism-vs-batch.en.svg" width="100%" alt="Controlled study of metabolism versus batch: key metrics across 50 topics and 892 hypotheses">
</p>

| Metric | Batch baseline | Metabolism | Difference |
|--------|----------------|------------|------------|
| Hit rate: fraction of hypotheses validated by later papers | 3.0% | **5.8%** | **1.9 times** |
| Useful hypotheses per topic | 13.7 | **17.3** | **+26%** |
| LLM-judged novelty (1–10 scale) | 6.39 | **6.82** | **+0.43** |
| Token cost per hypothesis | 434K | **30K** | **92% lower** |

## 3. How to Use Scientify

Visit **[Scientify.tech](https://scientify.tech)**, sign up or log in, and enter your research objective in the workspace to begin.

Scientify runs research tasks continuously on an isolated cloud computer, keeping papers, code, data, and experimental results in one workspace. Tasks continue after you close your computer. Return from your phone or another device to check progress, add materials, and continue your research.
