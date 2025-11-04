// netlify/functions/proxy.js

const fetch = require('node-fetch');

// 关键步骤：在函数运行开始时构建路由表
const dynamicRoutes = [];
let i = 1;
while (true) {
	const proxyPath = process.env[`PROXY_PATH_${i}`];
	const targetUrl = process.env[`TARGET_URL_${i}`];

	if (!proxyPath || !targetUrl) {
		break;
	}
	// 将路径和 URL 存储为对象
	dynamicRoutes.push({
		path: proxyPath.startsWith('/') ? proxyPath : '/' + proxyPath,
		url: targetUrl,
	});
	i++;
}

function getTargetInfo(originalPath) {
	// 1. 检查固定 /api 路由
	if (originalPath.startsWith('/api')) {
		return {
			baseUrl: process.env.API_SERVER_URL,
			pathPrefixLength: '/api'.length,
		};
	}

	// 2. 检查动态路由 (使用缓存的路由表)
	for (const route of dynamicRoutes) {
		if (originalPath.startsWith(route.path)) {
			return {
				baseUrl: route.url,
				pathPrefixLength: route.path.length,
			};
		}
	}

	// 3. 默认路由 (必须是最后一个匹配规则)
	return {
		baseUrl: process.env.DEFAULT_SERVER_URL,
		pathPrefixLength: 0, // 默认 / 代理，不移除前缀
	};
}

exports.handler = async (event, context) => {
	try {
		const { path, httpMethod, headers, body, queryStringParameters } = event;

		// 1. 获取 Netlify 原始请求路径 (这是关键)
		// 移除 Netlify Function 路径前缀（/.netlify/functions/proxy）
		let originalPath = path.replace(/^\/\.netlify\/functions\/proxy/, '');

		// 确保 / 请求的原始路径是 /
		if (originalPath === '') {
			originalPath = '/';
		}

		// 2. 获取目标信息
		const { baseUrl, pathPrefixLength } = getTargetInfo(originalPath);

		if (!baseUrl) {
			console.error('Missing ENV configuration for proxy.');
			return { statusCode: 500, body: 'Server Configuration Error.' };
		}

		// 3. 构造目标 URL
		// 使用 slice 移除前缀，更清晰、更安全
		const targetPath = originalPath.slice(pathPrefixLength);

		// 目标路径如果为空，确保是 /
		const finalTargetPath = targetPath === '' ? '/' : targetPath;

		const query = new URLSearchParams(queryStringParameters).toString();
		const fullTargetUrl = `${baseUrl}${finalTargetPath}${query ? '?' + query : ''}`;

		console.log(`Proxying ${httpMethod} request to: ${fullTargetUrl}`);

		// 4. 构建请求头部 (清理)
		const proxyHeaders = { ...headers };
		// 移除所有 Netlify/CDN 特有的头部，确保后端接收纯净请求
		delete proxyHeaders.host;
		delete proxyHeaders['x-netlify-original-pathname'];
		delete proxyHeaders['x-forwarded-host'];
		delete proxyHeaders['x-forwarded-proto'];

		// 4.1. 构造用于 fetch 请求的配置对象
		const fetchOptions = {
			method: httpMethod,
			headers: proxyHeaders,
		};

		// 4.2. 只有当方法不是 GET 或 HEAD 时，才添加 body 参数
		if (httpMethod !== 'GET' && httpMethod !== 'HEAD') {
			// 确保 body 存在且非空，虽然 Netlify event.body 可能是 null 或 string
			if (body) {
				fetchOptions.body = body;
			}
		}

		// 4.3. 发送代理请求
		const response = await fetch(fullTargetUrl, fetchOptions);

		// --- 返回响应 ---
		const responseBody = await response.text();
		const responseHeaders = Object.fromEntries(response.headers.entries());
		delete responseHeaders['content-encoding'];

		return {
			statusCode: response.status,
			headers: responseHeaders,
			body: responseBody,
			isBase64Encoded: false,
		};
	} catch (error) {
		console.error('Proxy Error:', error);
		return {
			statusCode: 502,
			body: JSON.stringify({ error: 'Proxy failed to connect.', details: error.message }),
		};
	}
};
