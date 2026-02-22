# Academic Search & Download Tools

scientify 提供三套学术资源获取工具：arXiv、OpenAlex、Unpaywall。

---

## 工具对比

| 工具 | 覆盖范围 | 优势 | 限制 |
|------|---------|------|------|
| **arXiv** | STEM 预印本 | 最新研究、有源码 | 仅限 arXiv 论文 |
| **OpenAlex** | 所有学科 | 覆盖广、元数据丰富 | 不提供 PDF 下载 |
| **Unpaywall** | OA 论文 | 合法获取 PDF | 仅限 Open Access |

---

## 1. OpenAlex Search

搜索所有学科的学术论文，返回元数据（DOI、引用数、OA 状态等）。

### 参数

```typescript
openalex_search({
  query: string,              // 搜索查询（标题、摘要、作者、关键词）
  max_results?: number,       // 最大结果数（1-100，默认 20）
  filter?: string,            // 过滤条件（可选）
  sort?: string               // 排序方式（可选）
})
```

### 过滤器示例

```javascript
// 只搜索 2020-2024 年的论文
filter: "publication_year:2020-2024"

// 只搜索 OA 论文
filter: "is_oa:true"

// 只搜索期刊文章
filter: "type:journal-article"

// 组合过滤（用逗号分隔）
filter: "publication_year:2020-2024,is_oa:true"
```

### 排序选项

- `relevance_score`（默认）：按相关性
- `cited_by_count`：按引用数（最常用）
- `publication_date`：按发表日期

### 使用示例

```javascript
// 基础搜索
openalex_search({
  query: "Vision Transformer image classification",
  max_results: 20
})

// 高级搜索：只要 OA 论文，按引用数排序
openalex_search({
  query: "graph neural network",
  max_results: 30,
  filter: "is_oa:true,publication_year:2020-2024",
  sort: "cited_by_count"
})

// 跨学科搜索
openalex_search({
  query: "machine learning healthcare",
  max_results: 50,
  filter: "type:journal-article"
})
```

### 返回结果

```json
{
  "query": "Vision Transformer",
  "total_count": 15234,
  "returned": 20,
  "works": [
    {
      "id": "W3177828909",
      "title": "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale",
      "doi": "10.48550/arxiv.2010.11929",
      "year": 2021,
      "date": "2021-06-03",
      "type": "article",
      "authors": ["Alexey Dosovitskiy", "Lucas Beyer", "..."],
      "venue": "International Conference on Learning Representations",
      "cited_by": 12453,
      "is_open_access": true,
      "oa_url": "https://arxiv.org/pdf/2010.11929",
      "abstract_preview": "While the Transformer architecture has become..."
    }
  ]
}
```

---

## 2. Unpaywall Download

根据 DOI 下载 Open Access 版本的论文 PDF。

### 参数

```typescript
unpaywall_download({
  dois: string[],           // DOI 列表（最多 20 个）
  output_dir: string        // 输出目录（绝对路径）
})
```

### 使用示例

```javascript
// 下载单篇论文
unpaywall_download({
  dois: ["10.48550/arxiv.2010.11929"],
  output_dir: "/Users/xxx/papers"
})

// 批量下载
unpaywall_download({
  dois: [
    "10.1038/s41586-021-03819-2",
    "10.1145/3447548.3467110",
    "10.48550/arxiv.2103.14030"
  ],
  output_dir: "$W/papers/_downloads"
})
```

### 返回结果

```json
{
  "total": 3,
  "success": 2,
  "not_oa": 1,
  "failed": 0,
  "output_dir": "/Users/xxx/papers",
  "results": [
    {
      "doi": "10.48550/arxiv.2010.11929",
      "status": "success",
      "message": "Downloaded successfully",
      "file_path": "/Users/xxx/papers/10.48550_arxiv.2010.11929.pdf",
      "title": "An Image is Worth 16x16 Words..."
    },
    {
      "doi": "10.1038/s41586-021-03819-2",
      "status": "not_oa",
      "message": "Paper is not open access",
      "title": "Highly accurate protein structure prediction..."
    },
    {
      "doi": "10.48550/arxiv.2103.14030",
      "status": "success",
      "message": "Downloaded successfully",
      "file_path": "/Users/xxx/papers/10.48550_arxiv.2103.14030.pdf",
      "title": "Swin Transformer: Hierarchical Vision Transformer..."
    }
  ]
}
```

### 状态码

- `success`：下载成功
- `not_oa`：非 OA 论文（无法下载）
- `no_pdf_url`：找不到 PDF 链接
- `download_failed`：下载失败（可能是访问限制）
- `api_error`：API 错误

### 错误处理

**Non-OA 论文不会导致工具失败**，而是在结果中标记为 `not_oa`，继续处理其他论文。

---

## 3. 组合使用流程

### 场景 1：跨学科文献调研

```javascript
// Step 1: 用 OpenAlex 搜索（覆盖所有学科）
openalex_search({
  query: "transfer learning computer vision",
  max_results: 30,
  filter: "is_oa:true,publication_year:2020-2024",
  sort: "cited_by_count"
})

// Step 2: 从结果中提取 DOI
const dois = results.works
  .filter(w => w.is_open_access && w.doi)
  .map(w => w.doi);

// Step 3: 用 Unpaywall 下载 PDF
unpaywall_download({
  dois: dois,
  output_dir: "$W/papers/_downloads"
})
```

### 场景 2：补充 arXiv 无法覆盖的领域

```javascript
// arXiv 主要是 STEM，其他领域用 OpenAlex
openalex_search({
  query: "qualitative research methods social science",
  max_results: 20,
  filter: "is_oa:true"
})
```

### 场景 3：获取高引用论文

```javascript
// 找最有影响力的论文
openalex_search({
  query: "BERT language model",
  max_results: 10,
  sort: "cited_by_count",
  filter: "cited_by_count:>1000"  // 只要被引用 >1000 次的
})
```

---

## API 配额和限制

### OpenAlex

- **免费无需 API key**
- Rate limit: ~10 requests/second（polite pool）
- 通过 `mailto` 参数可提高限额（已内置）
- 文档：https://docs.openalex.org

### Unpaywall

- **免费无需 API key**
- Rate limit: 100k requests/day
- 需要提供 email（已内置）
- 文档：https://unpaywall.org/products/api

---

## 与 arXiv 工具的区别

| | arXiv | OpenAlex + Unpaywall |
|---|---|---|
| **覆盖范围** | STEM 预印本 | 所有学科（期刊、会议、预印本）|
| **最新程度** | 最新（预印本） | 较新（发表后索引） |
| **PDF 下载** | 源码 + PDF | 仅 OA 论文的 PDF |
| **元数据** | 标题、摘要、作者 | 引用数、OA 状态、venue、DOI |
| **典型用途** | ML/AI/Physics 等 STEM 领域 | 跨学科调研、查找高引用论文 |

---

## 在 Skill 中使用

### literature-survey 更新建议

当前 literature-survey 只用 arXiv，可以扩展为：

```markdown
### Phase 2: 搜索论文

#### 2.1 选择搜索工具

- **STEM 领域**（CS、Physics、Math）：优先用 `arxiv_search`
- **跨学科或非 STEM**：用 `openalex_search`
- **需要高引用论文**：用 `openalex_search` + `sort: "cited_by_count"`

#### 2.2 下载论文

- **arXiv 论文**：用 `arxiv_download`（获取 .tex 源码）
- **其他 OA 论文**：用 `unpaywall_download`（获取 PDF）
- **Non-OA 论文**：Unpaywall 会跳过，记录 DOI 供手动获取
```

---

## 故障排查

### OpenAlex 返回 429

**原因**：Rate limit 超限

**解决**：等待 1 分钟后重试，或减少 `max_results`

### Unpaywall 下载失败

**可能原因**：
1. 论文不是 OA → 正常，标记为 `not_oa`
2. PDF URL 失效 → 尝试从 OpenAlex 的 `oa_url` 下载
3. 网络问题 → 检查网络连接

### OpenAlex 搜索结果少

**可能原因**：
- 查询词过于具体
- 过滤条件太严格（如 `cited_by_count:>5000`）

**解决**：
- 放宽查询词
- 移除部分 filter
- 增加 `max_results`

---

## 许可证说明

### OpenAlex

- 数据：CC0（公共领域）
- API：免费使用
- 要求：提供 email（polite pool）

### Unpaywall

- 数据：CC BY 4.0
- API：免费使用
- 要求：提供 email
- **重要**：只提供 OA 版本，不违反版权

---

## 更新日志

- **v1.6.2**：新增 `openalex_search` 和 `unpaywall_download` 工具
