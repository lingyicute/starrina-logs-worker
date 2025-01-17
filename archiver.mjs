export default {
  // 设置 cron 触发器，北京时间每周一凌晨3点运行（UTC 时间周日 19:00）
  scheduled: "0 19 * * 0",
  
  async scheduled(event, env, ctx) {
    try {
      // 获取当前日期（北京时间）
      const date = new Date();
      const dateStr = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai' }).format(date).split('/').join('-');
      
      // 初始化循环变量
      let batchNumber = 1;
      let cursor = undefined;
      let logsRemaining = true;
      
      while (logsRemaining) {
        // 准备一个数组存储当前批次的日志
        const logs = [];
        
        // 获取一批次（最多 160 条）的日志
        const result = await env.REQUEST_LOG.list({ 
          prefix: 'request:', 
          cursor, 
          limit: 160 
        });

        // 如果没有日志了，退出循环
        if (result.keys.length === 0) {
          logsRemaining = false;
          break;
        }

        // 读取日志内容
        for (const key of result.keys) {
          const logEntry = await env.REQUEST_LOG.get(key.name, 'json');
          if (logEntry) {
            logs.push({ ...logEntry, key: key.name });
          }
        }

        // 将日志转换为 JSONL 格式
        const jsonlContent = logs.map(log => JSON.stringify(log)).join('\n');
        
        // 上传到 R2 存储桶
        const fileName = `${dateStr}-${batchNumber}.jsonl`;
        await env.STARRINA_LOGS.put(fileName, jsonlContent);

        // 顺序删除已归档的日志，确保不超出内存限制
        for (const log of logs) {
          await env.REQUEST_LOG.delete(log.key);
        }

        console.log(`成功归档 ${logs.length} 条日志到 ${fileName}`);

        // 更新游标和批次编号
        cursor = result.cursor;
        batchNumber++;

        // 如果游标为空，说明所有日志都已处理完
        if (!cursor) {
          logsRemaining = false;
        }
      }

    } catch (error) {
      console.error('归档日志时发生错误:', error);
    }
  }
};
