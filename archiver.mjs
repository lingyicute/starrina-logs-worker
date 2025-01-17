export default {
  // 设置 cron 触发器，北京时间每周一凌晨3点运行（UTC 时间周日 19:00）
  scheduled: "0 19 * * 0",
  
  async scheduled(event, env, ctx) {
    try {
      // 获取当前日期（北京时间）
      const date = new Date();
      date.setHours(date.getHours() + 8); // 转换为北京时间
      const dateStr = date.toISOString().split('T')[0];
      
      // 准备一个数组存储所有日志
      const logs = [];
      
      // 列出所有 KV 中的日志记录
      let listComplete = false;
      let cursor = undefined;
      
      while (!listComplete) {
        const result = await env.REQUEST_LOG.list({ 
          prefix: 'request:', 
          cursor 
        });
        
        // 获取所有日志内容
        for (const key of result.keys) {
          const logEntry = await env.REQUEST_LOG.get(key.name, 'json');
          if (logEntry) {
            logs.push(logEntry);
          }
        }
        
        cursor = result.cursor;
        listComplete = result.list_complete;
      }
      
      if (logs.length === 0) {
        console.log('没有找到需要归档的日志');
        return;
      }
      
      // 将日志转换为 JSONL 格式
      const jsonlContent = logs.map(log => JSON.stringify(log)).join('\n');
      
      // 上传到 R2 存储桶
      const fileName = `${dateStr}.jsonl`;
      await env.STARRINA_LOGS.put(fileName, jsonlContent);
      
      // 删除已归档的日志，进行分页处理
      let deleteComplete = false;
      cursor = undefined; // 重置分页指针

      while (!deleteComplete) {
        const result = await env.REQUEST_LOG.list({
          prefix: 'request:',
          cursor
        });

        // 删除当前页面的日志
        for (const key of result.keys) {
          await env.REQUEST_LOG.delete(key.name);
        }

        cursor = result.cursor;
        deleteComplete = result.list_complete;
      }
      
      console.log(`成功归档 ${logs.length} 条日志到 ${fileName} 并删除了已归档的日志`);
      
    } catch (error) {
      console.error('归档日志时发生错误:', error);
    }
  }
};
