const DB_NAME = 'todo_app_db';
const DB_VERSION = 1;
const TODO_STORE = 'todos';
const DRAFT_STORE = 'drafts';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(TODO_STORE)) {
        const todoStore = db.createObjectStore(TODO_STORE, {
          keyPath: 'id',
        });
        todoStore.createIndex('status', 'status', { unique: false });
        todoStore.createIndex('dueDate', 'dueDate', { unique: false });
        todoStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, {
          keyPath: 'id',
        });
      }
    };
  });
}

function withStore(storeName, mode, callback) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const result = callback(store);

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export function getAllTodos() {
  return withStore(TODO_STORE, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
}

export function saveTodo(todo) {
  const now = new Date().toISOString();
  const data = {
    ...todo,
    updatedAt: now,
    createdAt: todo.createdAt || now,
  };

  return withStore(TODO_STORE, 'readwrite', (store) => {
    store.put(data);
  });
}

export function getTodoTabCounts() {
  return withStore(TODO_STORE, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const counts = { todo: 0, expired: 0, done: 0 };
      const now = Date.now();
      const index = store.index('status');
      const request = index.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const value = cursor.value;
          const status = value.status;
          const dueMs = value.dueDate ? new Date(value.dueDate).getTime() : null;

          if (status === 'done') {
            counts.done += 1;
          } else if (dueMs && dueMs < now) {
            counts.expired += 1;
          } else {
            counts.todo += 1;
          }
          cursor.continue();
        } else {
          resolve(counts);
        }
      };

      request.onerror = () => reject(request.error);
    });
  });
}

export function deleteTodo(id) {
  return withStore(TODO_STORE, 'readwrite', (store) => {
    store.delete(id);
  });
}

export function getDraft(id) {
  return withStore(DRAFT_STORE, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  });
}

export function saveDraft(id, draft) {
  const data = {
    id,
    content: draft,
    updatedAt: new Date().toISOString(),
  };
  return withStore(DRAFT_STORE, 'readwrite', (store) => {
    store.put(data);
  });
}

export function deleteDraft(id) {
  return withStore(DRAFT_STORE, 'readwrite', (store) => {
    store.delete(id);
  });
}


export function getTodosByStatus(status) {
  return withStore(TODO_STORE, 'readonly', (store) => {
    const index = store.index('status');
    return new Promise((resolve, reject) => {
      const request = index.getAll(IDBKeyRange.only(status));
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
}


