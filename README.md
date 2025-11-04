# 🚀 Netlify 混合配置化反向代理 (Serverless Function) 

本项目利用 Netlify Serverless Functions（无服务器函数）作为高性能边缘代理，将来自 Netlify 站点的请求根据路径转发到您自己的多个后端服务器，同时支持**固定路由**和**基于环境变量的动态路由配置**。

## 🌟 核心特性

* **配置化：** 通过 Netlify 环境变量管理所有后端服务器地址，无需修改代码即可更改目标。
* **多目标代理：** 可将不同路径（例如 `/api`、`/blog`）代理到同一域名下的不同端口或完全不同的服务器。
* **零部署更新：** 新增或修改动态代理路由时，只需更新环境变量，无需触发新的代码部署。

## 🛠️ 设置步骤

### 1. 项目结构

```
.
├── netlify
│   └── functions
│       └── proxy.js  \# 核心代理函数
├── netlify.toml      \# Netlify 路由和构建配置
├── package.json      \# Node.js 依赖文件
└── README.md
````

### 2. 安装依赖

本项目需要 `node-fetch` 来进行 HTTP 转发。

```bash
npm init -y
npm install node-fetch@2 
````

### 3\. 配置 Netlify 环境变量 (ENV Variables)

这是实现配置化的核心。请登录您的 Netlify 站点 -\> **Site settings (站点设置)** -\> **Build & deploy (构建与部署)** -\> **Environment variables (环境变量)**，添加以下变量：

#### A. 固定路由配置

| 变量名 (Key) | 示例值 | 作用路径 |
| :--- | :--- | :--- |
| `DEFAULT_SERVER_URL` | `http://test.test.cn:8083` | 用于默认路径 **`/`** (所有未匹配的请求) |
| `API_SERVER_URL` | `http://test.test.cn:8084` | 用于固定路径 **`/api`** |

#### B. 动态路由配置 (按需新增)

按照 Key-Value Pair 成对配置，实现动态代理。

| 变量名 (Key) | 示例值 | 描述 |
| :--- | :--- | :--- |
| `PROXY_PATH_1` | `/blog` | 客户端请求的路径前缀 |
| `TARGET_URL_1` | `http://test.test.cn:82` | 代理的目标服务器地址 |
| `PROXY_PATH_2` | `/admin` | 另一个动态路径前缀 |
| `TARGET_URL_2` | `http://another-server.com:9000` | 另一个动态目标地址 |

### 4\. `netlify.toml` 配置 (路由转发)

配置 Netlify 路由规则，确保所有请求都重写到 `proxy.js` 函数。

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

### 5\. `proxy.js` 代码 (详见代码库)

核心函数负责以下逻辑：

1.  **加载路由表：** 在函数冷启动时，加载所有 `PROXY_PATH_N` 和 `TARGET_URL_N` 环境变量，构建路由配置表。
2.  **路径解析：** 获取客户端原始请求路径。
3.  **路由匹配：** 依次匹配固定 `/api`、动态路由表，最后匹配默认 `/`。
4.  **路径清理：** 根据匹配的规则，从原始路径中移除对应的路径前缀。
5.  **请求转发：** 使用 `node-fetch` 将请求（包括 Header 和 Body）转发到目标 URL。
6.  **响应返回：** 将后端响应转发回客户端。

## 📋 路由工作示例

假设您的 Netlify 域名是 `https://yoursite.app`，且环境变量如示例所示。

| 客户端请求 | 匹配规则 | 目标服务器 | 代理到的目标 URL |
| :--- | :--- | :--- | :--- |
| `https://yoursite.app/` | 默认规则 | `$DEFAULT_SERVER_URL` | `http://test.test.cn:8083/` |
| `https://yoursite.app/api/data` | 固定 `/api` | `$API_SERVER_URL` | `http://test.test.cn:8084/data` |
| `https://yoursite.app/blog/post` | 动态 `/blog` | `$TARGET_URL_1` | `http://test.test.cn:82/post` |
| `https://yoursite.app/admin/login`| 动态 `/admin` | `$TARGET_URL_2` | `http://another-server.com:9000/login` |

-----

## ⚠️ 注意事项

  * **超时限制：** Netlify Functions 有严格的执行时间限制（通常约 10 秒）。如果您的后端响应时间超过此限制，请求会超时失败。
  * **免费额度：** 请关注 Netlify Functions 的每月调用次数和执行时间限制。
  * **路径匹配顺序：** 在 `proxy.js` 中，匹配顺序为 **固定 `/api` -\> 动态路由 -\> 默认 `/`**。请确保动态路由的前缀不与固定路由冲突。

<!-- end list -->