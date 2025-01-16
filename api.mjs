export default {
  async fetch(request, env) {
    try {
      // 检查IP地址
      const clientIP = request.headers.get('cf-connecting-ip');
      if (clientIP !== '138.2.54.99') {
        return new Response('Forbidden', {
          status: 403,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }

      const url = new URL(request.url);
      const path = url.pathname;

      // 处理 CORS
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",  // 此处可根据需求修改为特定域
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "*"
          }
        });
      }

      // 列出所有归档文件
      if (path === "/archives") {
        const files = [];
        let cursor = null;

        do {
          const listResult = await env.ARCHIVE_BUCKET.list({ cursor });
          cursor = listResult.cursor;
          files.push(...listResult.objects.map(obj => ({
            name: obj.key,
            size: obj.size,
            uploaded: obj.uploaded,
            metadata: obj.customMetadata
          })));
        } while (cursor);

        return new Response(JSON.stringify(files, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"  // 同上，根据需求修改
          }
        });
      }

      // 获取特定归档文件内容
      if (path.startsWith("/archive/")) {
        const fileName = path.replace("/archive/", "");
        const file = await env.ARCHIVE_BUCKET.get(fileName);

        if (!file) {
          return new Response("Archive not found", { status: 404 });
        }

        const content = await file.text();
        return new Response(content, {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error('Error handling request:', error);
      return new Response(error.message, { status: 500 });
    }
  }
};
