## 🚀 Netlify 混合模式反向代理 (Serverless Function)

本项目利用 Netlify Serverless Functions（Node.js）作为高性能边缘代理，实现对请求的精细化控制。它通过环境变量支持**固定路由**、**可扩展的动态路由配置**，并能对**所有路径**控制转发行为，实现 **透明反向代理 (PROXY)** 或 **客户端重定向 (REDIRECT)**。

🉑利用 Netlify/ Vercel 作为私人网站反向代理服务器入口，推荐仅面板入口（sunpanel、某nav等）使用

### 🌟 核心特性

  * **全路径模式控制：** 固定路由（`/` 和 `/api`）和动态路由均可通过环境变量灵活切换 `PROXY` 或 `REDIRECT` 模式。
  * **配置化管理：** 所有路由规则和行为均通过 Netlify 环境变量管理，无需修改代码即可更新目标。
  * **路由优先级：** 固定 `/api` \> 动态路由表 \> 默认 `/`。

### 🛠️ 项目结构

```
/netlify-proxy-app
├── netlify/
│   └── functions/
│       └── proxy.js           # 核心 Netlify Function 逻辑
├── netlify.toml               # Netlify 路由和构建配置
└── package.json               # Node.js 依赖文件
```

### ⚙️ 部署与配置步骤

#### 1\. 安装依赖

本项目需要 `node-fetch` 来进行 HTTP 转发。

```bash
npm install node-fetch@2 
```

#### 2\. 配置 Netlify 环境变量 (ENV Variables)

这是实现配置化的核心。请登录您的 Netlify 站点 -\> **Site settings (站点设置)** -\> **Build & deploy (构建与部署)** -\> **Environment variables (环境变量)**，配置以下变量：

##### A. 固定路由配置 (新增 Mode 控制)

| 变量名 (Key) | 示例值 | 作用路径 | 默认模式 |
| :--- | :--- | :--- | :--- |
| `DEFAULT_SERVER_URL` | `http://test.test.cn:8083` | **`/`** (所有未匹配的请求) | `PROXY` |
| **`DEFAULT_MODE`** | `REDIRECT` | `/` 路由的模式。未设置时默认为 `PROXY`。 | |
| `API_SERVER_URL` | `http://test.test.cn:8084` | **`/api`** | `PROXY` |
| **`API_MODE`** | `PROXY` | `/api` 路由的模式。未设置时默认为 `PROXY`。 | |

##### B. 动态路由配置 (可无限扩展)

| 变量名 (Key) | 示例值 | 描述 |
| :--- | :--- | :--- |
| `PROXY_PATH_1` | `/blog` | 客户端请求的路径前缀 |
| `TARGET_URL_1` | `http://test.test.cn:82` | 代理的目标服务器地址 |
| **`PROXY_MODE_1`** | `REDIRECT` | **控制行为 (`PROXY` 或 `REDIRECT`)**。未设置时默认为 `PROXY`。 |
| `PROXY_PATH_2` | `/admin` | 另一个动态路径前缀 |
| `TARGET_URL_2` | `http://another-server.com:9000` | 另一个动态目标地址 |
| **`PROXY_MODE_2`** | `PROXY` | 模式控制。 |

#### 3\. `netlify.toml` 路由配置

将此文件放置于项目根目录。它定义了 Netlify 边缘网络将所有请求重写到 `proxy.js` 函数。

```toml
# netlify.toml

[build]
  functions = "netlify/functions"
  publish = "." 

# --- 路由配置：将所有请求都重写到 proxy 函数 ---

# 1. 优先匹配 /api 路径
[[redirects]]
  from = "/api/*"           
  to = "/.netlify/functions/proxy"
  status = 200                  
  force = true

# 2. Catch-all 规则：捕获所有其他请求 (包括 / 和所有动态路径)
[[redirects]]
  from = "/*"           
  to = "/.netlify/functions/proxy"
  status = 200                  
  force = true
```

### 📋 路由工作示例

假设您配置了 `DEFAULT_MODE=REDIRECT` 且 `API_MODE=PROXY`：

| 客户端请求 | 匹配规则 | 模式控制 Key | 结果行为 |
| :--- | :--- | :--- | :--- |
| `https://yoursite.app/` | 默认规则 | `DEFAULT_MODE` | **HTTP 302 重定向**到 `DEFAULT_SERVER_URL/` |
| `https://yoursite.app/api/data` | 固定 `/api` | `API_MODE` | **透明代理**到 `API_SERVER_URL/data` |
| `https://yoursite.app/blog/post` | 动态 `/blog` | `PROXY_MODE_1` | **透明代理/重定向** (取决于 `PROXY_MODE_1` 配置) |

### ⚠️ 关键注意事项

  * **模式切换用途：**
      * `REDIRECT` 模式可以节省 Netlify Function 的调用次数，但会将目标 URL 暴露给客户端。
      * `PROXY` 模式会消耗 Function 资源，但能保持客户端 URL 不变，适用于 API 代理。
  * **Serverless 限制：** Netlify Functions 有严格的执行时间限制（通常为 10 秒）。对于长时间连接或响应较慢的后端，请注意超时问题。
  * **Header 处理：** `proxy.js` 代码会清理不必要的 Netlify 头部，确保后端接收到干净的请求。
