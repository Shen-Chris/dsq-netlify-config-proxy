// api/proxy.js
const fetch = require('node-fetch');

// --- Global/Cold Start Configuration ---
// 读取固定路由模式，如果未设置，默认使用 PROXY
const DEFAULT_MODE = (process.env.DEFAULT_MODE || 'PROXY').toUpperCase();
const API_MODE = (process.env.API_MODE || 'PROXY').toUpperCase();

// 1. 动态路由配置表构建 (在函数冷启动时执行)
const dynamicRoutes = [];
let i = 1;
while (true) {
	const proxyPath = process.env[`PROXY_PATH_${i}`];
	const targetUrl = process.env[`TARGET_URL_${i}`];
	// 新增：读取 PROXY_MODE_N，默认设置为 PROXY
	const proxyMode = process.env[`PROXY_MODE_${i}`] || 'PROXY';

	if (!proxyPath || !targetUrl) {
		break;
	}

	dynamicRoutes.push({
		path: proxyPath.startsWith('/') ? proxyPath : '/' + proxyPath,
		url: targetUrl,
		mode: proxyMode.toUpperCase(), // 存储大写模式
	});
	i++;
}

// 2. 路由匹配函数 (返回模式)
function getTargetInfo(originalPath) {
	// 检查固定 /api 路由
    if (originalPath.startsWith('/api')) {
        return {
            baseUrl: process.env.API_SERVER_URL,
            pathPrefixLength: '/api'.length,
            mode: API_MODE // <--- 使用配置的 API_MODE
        };
    }

	// 检查动态路由
	for (const route of dynamicRoutes) {
		if (originalPath.startsWith(route.path)) {
			return {
				baseUrl: route.url,
				pathPrefixLength: route.path.length,
				mode: route.mode, // 返回配置的模式
			};
		}
	}

	// 默认路由
    return {
        baseUrl: process.env.DEFAULT_SERVER_URL,
        pathPrefixLength: 0,
        mode: DEFAULT_MODE // <--- 使用配置的 DEFAULT_MODE
    };
}

// 3. Vercel Serverless Function 入口点 (req, res 签名)
export default async function (req, res) {
	const httpMethod = req.method;
	const headers = req.headers;
	// Vercel 自动解析 body，但可能需要重新序列化
	const requestBody = httpMethod === 'GET' || httpMethod === 'HEAD' ? null : req.body;

	try {
		// Vercel 平台获取原始路径和查询参数
		const url = new URL(`http://localhost${req.url}`);
		let originalPath = url.pathname;
		const queryStringParameters = Object.fromEntries(url.searchParams.entries());

		// 确保 / 请求的原始路径是 /
		if (originalPath === '/') {
			originalPath = '/';
		} else if (originalPath.endsWith('/') && originalPath.length > 1) {
			originalPath = originalPath.slice(0, -1);
		}

		// 4. 路由和目标获取
		const { baseUrl, pathPrefixLength, mode } = getTargetInfo(originalPath);

		if (!baseUrl) {
			res.status(500).json({ error: 'Configuration Error: Missing target server URL.' });
			return;
		}

		// 5. 构造目标 URL
		const targetPath = originalPath.slice(pathPrefixLength);
		const finalTargetPath = targetPath === '' ? '/' : targetPath;

		const query = new URLSearchParams(queryStringParameters).toString();
		const fullTargetUrl = `${baseUrl}${finalTargetPath}${query ? '?' + query : ''}`;

		// 6. 核心逻辑分支：根据 mode 决定是重定向还是代理
		if (mode === 'REDIRECT') {
			console.log(`Redirecting request to: ${fullTargetUrl}`);

			// 执行 302 (Found) 重定向
			res.status(302).setHeader('Location', fullTargetUrl).end();
			return;
		}

		// --- 以下是 PROXY 模式（代理）的逻辑 ---
		console.log(`Proxying request to: ${fullTargetUrl}`);

		// 7. 发送代理请求
		const proxyResponse = await fetch(fullTargetUrl, {
			method: httpMethod,
			headers: proxyHeaders,
			// 确保 body 是 stringified JSON 或原始 Buffer/Stream
			body: requestBody && typeof requestBody !== 'string' ? JSON.stringify(requestBody) : requestBody,
		});

		// 8. 返回响应
		res.status(proxyResponse.status);

		proxyResponse.headers.forEach((value, name) => {
			if (name.toLowerCase() !== 'content-encoding') {
				res.setHeader(name, value);
			}
		});

		const responseBuffer = await proxyResponse.buffer();
		res.end(responseBuffer);
	} catch (error) {
		console.error('Vercel Proxy Error:', error, error.stack);
		res.status(502).json({ error: 'Proxy failed to connect.', details: error.message });
	}
}
