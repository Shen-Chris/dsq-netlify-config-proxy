// api/proxy.js

const fetch = require('node-fetch');

// 1. 动态路由配置表构建 (在函数冷启动时执行)
const dynamicRoutes = [];
let i = 1;
while (true) {
    // 读取 Vercel 环境变量
    const proxyPath = process.env[`PROXY_PATH_${i}`];
    const targetUrl = process.env[`TARGET_URL_${i}`];

    if (!proxyPath || !targetUrl) {
        break; 
    }

    dynamicRoutes.push({
        path: proxyPath.startsWith('/') ? proxyPath : '/' + proxyPath,
        url: targetUrl
    });
    i++;
}

// 2. 路由匹配函数
function getTargetInfo(originalPath) {
    // 检查固定 /api 路由
    if (originalPath.startsWith('/api')) {
        return {
            baseUrl: process.env.API_SERVER_URL,
            pathPrefixLength: '/api'.length
        };
    } 

    // 检查动态路由
    for (const route of dynamicRoutes) {
        if (originalPath.startsWith(route.path)) {
            return {
                baseUrl: route.url,
                pathPrefixLength: route.path.length
            };
        }
    }

    // 默认路由
    return {
        baseUrl: process.env.DEFAULT_SERVER_URL,
        pathPrefixLength: 0 
    };
}


// 3. Vercel Serverless Function 入口点 (req, res 签名)
export default async function (req, res) {
    const httpMethod = req.method;
    const headers = req.headers;
    // Vercel 自动解析 body，但可能需要重新序列化
    const requestBody = (httpMethod === 'GET' || httpMethod === 'HEAD') ? null : req.body;

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
        const { baseUrl, pathPrefixLength } = getTargetInfo(originalPath);

        if (!baseUrl) {
             res.status(500).json({ error: 'Configuration Error: Missing target server URL.' });
             return;
        }

        // 5. 构造目标 URL
        const targetPath = originalPath.slice(pathPrefixLength);
        const finalTargetPath = targetPath === '' ? '/' : targetPath;

        const query = new URLSearchParams(queryStringParameters).toString();
        const fullTargetUrl = `${baseUrl}${finalTargetPath}${query ? '?' + query : ''}`;
        
        console.log(`Proxying ${httpMethod} request to: ${fullTargetUrl}`);
        
        // 6. 构建请求头部 (清理)
        const proxyHeaders = { ...headers };
        delete proxyHeaders.host;
        delete proxyHeaders['x-vercel-forwarded-for']; 
        
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