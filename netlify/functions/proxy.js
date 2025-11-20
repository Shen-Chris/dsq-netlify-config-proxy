// netlify/functions/proxy.js

const fetch = require('node-fetch');

// --- Global/Cold Start Configuration ---
// 在函数冷启动时读取所有不变的配置，提高效率

// 1. 固定路由模式 (如果未设置，默认为 PROXY)
const DEFAULT_MODE = (process.env.DEFAULT_MODE || 'PROXY').toUpperCase();
const API_MODE = (process.env.API_MODE || 'PROXY').toUpperCase();

// 2. 动态路由配置表构建
const dynamicRoutes = [];
let i = 1;
while (true) {
	const proxyPath = process.env[`PROXY_PATH_${i}`];
	const targetUrl = process.env[`TARGET_URL_${i}`];
	// 读取动态模式，如果未设置，默认为 PROXY
	const proxyMode = (process.env[`PROXY_MODE_${i}`] || 'PROXY').toUpperCase();

	if (!proxyPath || !targetUrl) {
		break;
	}

	dynamicRoutes.push({
		path: proxyPath.startsWith('/') ? proxyPath : '/' + proxyPath,
		url: targetUrl,
		mode: proxyMode,
	});
	i++;
}

// 3. 路由匹配函数：根据请求路径返回目标信息和模式
function getTargetInfo(originalPath) {
	// 检查固定 /api 路由
	if (originalPath.startsWith('/api')) {
		return {
			baseUrl: process.env.API_SERVER_URL,
			pathPrefixLength: '/api'.length,
			mode: API_MODE,
		};
	}

	// 检查动态路由
	for (const route of dynamicRoutes) {
		if (originalPath.startsWith(route.path)) {
			return {
				baseUrl: route.url,
				pathPrefixLength: route.path.length,
				mode: route.mode,
			};
		}
	}

	// 默认路由
	return {
		baseUrl: process.env.DEFAULT_SERVER_URL,
		pathPrefixLength: 0,
		mode: DEFAULT_MODE,
	};
}

// Netlify Function 入口点
exports.handler = async (event, context) => {
	// 1. 获取请求信息
	const { path, httpMethod, headers, body, queryStringParameters } = event;

	try {
		// 2. 获取原始请求路径
		// 移除 Netlify Function 路径前缀（/.netlify/functions/proxy）
		let originalPath = path.replace(/^\/\.netlify\/functions\/proxy/, '');

		// 确保 / 请求的原始路径是 /
		if (originalPath === '') {
			originalPath = '/';
		}

		// 3. 路由和目标获取
		const { baseUrl, pathPrefixLength, mode } = getTargetInfo(originalPath);

		if (!baseUrl) {
			console.error('Missing ENV configuration for proxy.');
			return { statusCode: 500, body: 'Server Configuration Error: Missing Base URL.' };
		}

		// 4. 构造目标 URL
		const targetPath = originalPath.slice(pathPrefixLength);
		const finalTargetPath = targetPath === '' ? '/' : targetPath;
		const query = new URLSearchParams(queryStringParameters).toString();
		const fullTargetUrl = `${baseUrl}${finalTargetPath}${query ? '?' + query : ''}`;

		// 5. 核心逻辑分支：根据 mode 决定是重定向还是代理

		if (mode === 'REDIRECT') {
			console.log(`Redirecting request to: ${fullTargetUrl}`);

			// 返回 302 (Found) 重定向
			return {
				statusCode: 302,
				headers: {
					Location: fullTargetUrl,
					// 确保浏览器不会缓存这个重定向
					'Cache-Control': 'no-cache, no-store, must-revalidate',
				},
			};
		}

		// --- PROXY 模式（代理）的逻辑 ---
		console.log(`Proxying ${httpMethod} request to: ${fullTargetUrl}`);

		// 6. 构建请求头部 (清理 Netlify 头部)
		const proxyHeaders = { ...headers };
		delete proxyHeaders.host;
		delete proxyHeaders['x-netlify-original-pathname'];
		delete proxyHeaders['x-forwarded-host'];
		delete proxyHeaders['x-forwarded-proto'];

		// 7. 解决 GET/HEAD 方法不能有 Body 的问题
		const requestBody = httpMethod === 'GET' || httpMethod === 'HEAD' ? null : body;

		// 8. 发送代理请求
		const proxyResponse = await fetch(fullTargetUrl, {
			method: httpMethod,
			headers: proxyHeaders,
			body: requestBody,
		});

		// 9. 返回响应
		// 9.1. 获取原始二进制 Buffer
		// node-fetch 的 .buffer() 方法能获取原始数据
		const responseBuffer = await proxyResponse.buffer();

		// 9.2. 处理响应头
		const responseHeaders = Object.fromEntries(proxyResponse.headers.entries());

		// 移除可能导致问题的头部
		// content-encoding: 后端可能返回 gzip，但我们在 function 中解压了 (buffer())，
		// 如果不移除这个头，浏览器会以为收到的是 gzip 数据而再次解压，导致乱码。
		delete responseHeaders['content-encoding'];
		delete responseHeaders['content-length']; // 让 Netlify 自动重新计算长度

		// 9.3. 返回通用响应 (Base64 模式)
		return {
			statusCode: proxyResponse.status,
			headers: responseHeaders,
			// 将二进制 Buffer 转为 Base64 字符串
			body: responseBuffer.toString('base64'),
			// 告诉 Netlify："这是 Base64 编码的数据，请解码后再发给浏览器"
			isBase64Encoded: true,
		};
	} catch (error) {
		console.error('Netlify Proxy Error:', error);
		return {
			statusCode: 502,
			body: JSON.stringify({ error: 'Proxy failed to connect.', details: error.message }),
		};
	}
};
