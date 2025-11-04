## 🚀 Vercel 混合配置化反向代理 (Serverless Function)

本项目利用 Vercel Serverless Functions（Node.js）作为高性能边缘代理，旨在将来自 Vercel 站点的请求根据路径转发到您的多个后端服务器。本项目最大的特点是支持**固定路由**和**基于环境变量的动态路由配置**。

### 🌟 核心特性

  * **配置化管理：** 所有后端服务器地址均通过 Vercel 环境变量管理，实现配置与代码分离，支持零部署更新。
  * **混合路由：** 支持固定路径代理（如 `/api`）和无限扩展的动态路径代理（如 `/blog`, `/admin`）。
  * **Vercel 适配：** 采用 Vercel 兼容的 `(req, res)` 函数签名和 `vercel.json` 路由配置。
  * **请求/响应透明：** 确保请求方法、Headers、Body 和查询参数被正确转发和返回。

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

这是实现配置化的核心。请登录您的 Vercel 仪表板，进入项目设置，配置以下环境变量：

##### A. 固定路由配置

| 变量名 (Key) | 示例值 | 作用路径 |
| :--- | :--- | :--- |
| `DEFAULT_SERVER_URL` | `http://test.test.cn:8083` | 用于默认路径 **`/`** (所有未匹配的请求) |
| `API_SERVER_URL` | `http://test.test.cn:8084` | 用于固定路径 **`/api`** |

##### B. 动态路由配置 (可无限扩展)

您可以通过成对配置 `PROXY_PATH_N` 和 `TARGET_URL_N` 来添加任何动态路由。

| 变量名 (Key) | 示例值 | 描述 |
| :--- | :--- | :--- |
| `PROXY_PATH_1` | `/blog` | 客户端请求的路径前缀 |
| `TARGET_URL_1` | `http://test.test.cn:82` | 代理的目标服务器地址 |
| `PROXY_PATH_2` | `/admin` | 另一个动态路径前缀 |
| `TARGET_URL_2` | `http://another-server.com:9000` | 另一个动态目标地址 |

#### 3\. `vercel.json` 路由配置

将此文件放置于项目根目录。它告诉 Vercel 的边缘网络将哪些请求发送到 `api/proxy.js` 函数。

```json
{
  "rewrites": [
    // 1. /api 路由
    {
      "source": "/api/:match*",
      "destination": "/api/proxy"
    },
    // 2. 默认 / 和其他动态路由 (捕获所有其他请求)
    {
      "source": "/:match*",
      "destination": "/api/proxy"
    }
  ]
}
```

#### 4\. `api/proxy.js` 函数逻辑

（**略**：请使用最终修正后的 Vercel 兼容代码，它包含了路由表构建、URL 解析、GET/HEAD Body 清理以及请求转发的核心逻辑。）

### 📋 路由工作示例

| 客户端请求 | 匹配规则 | 使用的 ENV Key | 代理到的目标 URL |
| :--- | :--- | :--- | :--- |
| `https://yoursite.app/` | 默认规则 | `DEFAULT_SERVER_URL` | `http://test.test.cn:8083/` |
| `https://yoursite.app/users` | 默认规则 | `DEFAULT_SERVER_URL` | `http://test.test.cn:8083/users` |
| `https://yoursite.app/api/data` | 固定 `/api` | `API_SERVER_URL` | `http://test.test.cn:8084/data` |
| `https://yoursite.app/blog/post` | 动态 `/blog` | `TARGET_URL_1` | `http://test.test.cn:82/post` |

### ⚠️ 关键注意事项

  * **Vercel URL 解析：** 在 `proxy.js` 中，我们使用 `new URL(\`http://localhost${req.url}\`)` 。这里的  `localhost`只是一个**占位符**，目的是为了让 JavaScript 的`URL`构造函数能正确解析`req.url\` 中包含的路径和查询参数。
  * **请求体清理：** 代码已包含对 `GET/HEAD` 请求体的清理，以避免 Node.js `fetch` API 报错。
  * **超时限制：** Vercel Serverless Functions 有严格的执行时间限制（通常为 10-15 秒，取决于套餐）。如果后端响应时间过长，代理请求将失败。