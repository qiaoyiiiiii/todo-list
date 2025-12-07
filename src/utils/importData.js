import { openDB } from "../indexedDB";

const TODO_STORE = "todos";

async function importDataToDB(data) {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(TODO_STORE, "readwrite");
      const store = tx.objectStore(TODO_STORE);
      
      // 清空现有数据
      store.clear();
      
      // 添加新数据
      data.forEach(item => {
        // 处理可能的null值
        const processedItem = {
          ...item,
          dueDate: item.dueDate || "",
          completedAt: item.completedAt || "",
          completeRemark: item.completeRemark || "",
          description: item.description || ""
        };
        
        store.put(processedItem);
      });

      tx.oncomplete = () => {
        console.log(`成功导入 ${data.length} 条数据`);
        db.close();
        resolve();
      };
      
      tx.onerror = (event) => {
        console.error("导入数据失败:", event.target.error);
        db.close();
        reject(event.target.error);
      };
      
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

// 从data.json文件读取数据并导入
async function runImport() {
  try {
    // 动态导入data.json文件
    const dataModule = await import("../asset/data.json");
    const data = dataModule.default || dataModule;
    
    if (!Array.isArray(data)) {
      throw new Error("数据格式不正确，应该是一个数组");
    }
    
    await importDataToDB(data);
    console.log("数据导入完成！");
  } catch (error) {
    console.error("导入过程中出现错误:", error);
  }
}

// 提供一个可以在浏览器控制台中调用的函数
if (typeof window !== 'undefined') {
  window.runImport = runImport;
}

// 正确导出runImport函数
export { runImport };
export default runImport;