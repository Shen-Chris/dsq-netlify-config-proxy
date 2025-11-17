
## 🚀 Vercel 混合配置化代理 (Serverless Function)

本项目利用 Vercel Serverless Functions（Node.js）作为高性能边缘转发器，实现对请求的精细化控制。它通过环境变量支持**固定路由**、**可扩展的动态路由配置**，并能对**所有路径**控制路由是进行**透明反向代理 (PROXY)** 还是执行**客户端重定向 (REDIRECT)**。

### 🌟 核心特性

  * **全路径模式控制：** 固定路由（`/` 和 `/api`）和动态路由均可通过环境变量灵活切换 **`PROXY`** 或 **`REDIRECT`** 模式。
  * **配置化管理：** 所有路由规则和行为均通过 Vercel 环境变量管理。
  * **Vercel 适配：** 采用 Vercel 兼容的 `(req, res)` 函数签名和 `vercel.json` 路由配置。
  * **路由优先级：** 固定 `/api` \> 动态路由表 \> 默认 `/`。

### 🛠️ 项目结构

```
/vercel-proxy-app
├── api/
│   └── proxy.js           # 核心 Vercel Serverless Function
├── package.json           # 项目依赖
└── vercel.json            # Vercel 路由配置
```

### ⚙️ 部署与配置步骤

#### 1\. 安装依赖

本项目需要 `node-fetch` 来进行 HTTP 转发。

```bash
npm install node-fetch@2 
```

#### 2\. 配置 Vercel 环境变量 (ENV Variables)

在 Vercel 平台设置中，配置以下变量：

##### A. 固定路由配置 **(新增 Mode 控制)**

| 变量名 (Key) | 示例值 | 作用路径 | 模式控制 Key (可选) |
| :--- | :--- | :--- | :--- |
| `DEFAULT_SERVER_URL` | `http://test.test.cn:8083` | **`/`** (所有未匹配的请求) | **`DEFAULT_MODE`** |
| **`DEFAULT_MODE`** | `REDIRECT` | 默认路由的模式。未设置时默认为 `PROXY`。 | N/A |
| `API_SERVER_URL` | `http://test.test.cn:8084` | **`/api`** | **`API_MODE`** |
| **`API_MODE`** | `PROXY` | `/api` 路由的模式。未设置时默认为 `PROXY`。 | N/A |

##### B. 动态路由配置 (可无限扩展)

| 变量名 (Key) | 示例值 | 描述 |
| :--- | :--- | :--- |
| `PROXY_PATH_1` | `/blog` | 客户端请求的路径前缀 |
| `TARGET_URL_1` | `http://test.test.cn:82` | 代理的目标服务器地址 |
| **`PROXY_MODE_1`** | `REDIRECT` | **控制行为 (`PROXY` 或 `REDIRECT`)**。未设置时默认为 `PROXY`。 |
| `PROXY_PATH_2` | `/admin` | 另一个动态路径前缀 |
| `TARGET_URL_2` | `http://another-server.com:9000` | 另一个动态目标地址 |
| **`PROXY_MODE_2`** | `PROXY` | 模式控制。 |

#### 3\. `vercel.json` 路由配置

将此文件放置于项目根目录，将所有请求导向 `api/proxy.js` 函数。

```json
{
  "rewrites": [
    {
      "source": "/api/:match*",
      "destination": "/api/proxy"
    },
    {
      "source": "/:match*",
      "destination": "/api/proxy"
    }
  ]
}
```

### 📋 路由工作示例

| 客户端请求 | 匹配规则 | 配置模式 | 结果行为 |
| :--- | :--- | :--- | :--- |
| `https://yoursite.app/` | 默认规则 | `PROXY` | **透明代理**到 `http://test.test.cn:8083/` |
| `https://yoursite.app/api/data` | 固定 `/api` | `PROXY` | **透明代理**到 `http://test.test.cn:8084/data` |
| `https://yoursite.app/blog/post` | 动态 `/blog` | `REDIRECT` | **HTTP 302 重定向**到 `http://test.test.cn:82/post` |
| `https://yoursite.app/admin/login`| 动态 `/admin` | `PROXY` | **透明代理**到 `http://another-server.com:9000/login` |

### ⚠️ 关键注意事项

  * **URL 解析占位符：** 在 `proxy.js` 中使用 `http://localhost${req.url}` 仅是为了让 JavaScript 的 `URL` 构造函数能正确解析路径和查询参数，不代表实际连接到本地主机。
  * **性能考量：** 强烈建议将不依赖 Serverless Function 逻辑的静态资源或纯跳转需求设置为 `REDIRECT` 模式，以节省 Function 的调用次数和执行时间。
  * **Vercel 超时：** Vercel Serverless Functions 有严格的执行时间限制。如果您的后端响应时间超过限制，代理请求将超时失败。
