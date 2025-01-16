export default {
  // 配置 cron 触发器为每10天运行一次 
  async scheduled(event, env, ctx) {
    try {
      // 获取当前时间戳 
      const now = new Date(); 
      const timestamp = now.toISOString(); 

      // 计算10天前的时间戳 
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); 
      const startTimestamp = tenDaysAgo.toISOString(); 

      // 构建归档文件名 
      const archiveFileName = `request-logs-${startTimestamp.split('T')[0]}-to-${timestamp.split('T')[0]}.jsonl`; 

      // 获取所有符合时间范围的记录 
      const records = []; 
      let cursor = null; 

      do { 
        // 使用 list 方法获取所有以 request: 开头的键 
        const listResult = await env.REQUEST_LOG.list({
          prefix: 'request:',  
          cursor, 
          limit: 1000 // 每次获取1000条记录 
        });

        cursor = listResult.cursor;

        // 获取每条记录的内容
        for (const key of listResult.keys) {
          const value = await env.REQUEST_LOG.get(key.name);
          if (value) {
            const record = JSON.parse(value);
            // 转换时间戳并只收集10天前的记录
            const recordTimestamp = new Date(record.timestamp).getTime();
            const start = new Date(startTimestamp).getTime();
            const end = new Date(timestamp).getTime();

            if (recordTimestamp >= start && recordTimestamp < end) {
              records.push(record);
            }
          }
        }
      } while (cursor);

      if (records.length === 0) { 
        console.log('No records found in the specified time range'); 
        return; 
      }

      // 将记录转换为JSONL格式
      const jsonlContent = records.map(record => JSON.stringify(record)).join('\n');

      // 将文件保存到 R2
      await env.ARCHIVE_BUCKET.put(archiveFileName, jsonlContent, {
        customMetadata: { 
          recordCount: records.length.toString(),
          timeRange: `${startTimestamp} to ${timestamp}`
        }
      });

      // 删除已归档的记录
      for (const record of records) {
        const key = `request:${record.timestamp}:${record.id}`;  // 确保键的构造正确
        await env.REQUEST_LOG.delete(key);
      }

      console.log(`Successfully archived ${records.length} records to ${archiveFileName}`);

    } catch (error) {
      console.error('Error during archival process:', error);
      throw error;
    }
  },

  // 添加一个 HTTP 处理器来查询归档记录
  async fetch(request, env) {
    try {
      // 检查IP地址
      const clientIP = request.headers.get('cf-connecting-ip'); 
      if (clientIP !== '138.2.54.99') { 
        return new Response('Forbidden', { 
          status: 403, 
          headers: { 
            "Access-Control-Allow-Origin": "*" 
          } 
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
