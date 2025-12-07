import { ElNotification } from "element-plus";

const TEN_MIN_MS = 10 * 60 * 1000;
const timers = new Map();
let onExpireCallback = null;

function notifyTodo(todo) {
  try {
    const title = `任务即将到期：${todo.title || "(未命名)"}`;
    const due = todo.dueDate ? new Date(todo.dueDate).toLocaleString() : "";
    ElNotification({
      title: title,
      message: `${due}`,
      type: "warning",
      duration: 6000,
    });
  } catch (e) {
    console.warn("任务到期提示失败", e);
  }
}

function clearTimer(id) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

function scheduleTodo(todo) {
  if (!todo || !todo.id) return;
  clearTimer(todo.id);
  if (!todo.dueDate) return;
  if (todo.status === "done") return;

  const dueMs = new Date(todo.dueDate).getTime();
  const now = Date.now();
  const diff = dueMs - now;
  if (diff <= 0) return;

  const notifyDelay = diff - TEN_MIN_MS;
  if (notifyDelay <= 0) {
    notifyTodo(todo);
  } else {
    const notifyTimer = setTimeout(() => {
      try {
        notifyTodo(todo);
      } finally {
        timers.delete(`notify_${todo.id}`);
      }
    }, notifyDelay);
    timers.set(`notify_${todo.id}`, notifyTimer);
  }

  const expireDelay = diff + 500;
  const expireTimer = setTimeout(() => {
    timers.delete(`expire_${todo.id}`);
    if (onExpireCallback) {
      try {
        onExpireCallback(todo.id);
      } catch (e) {
        console.warn("到期回调错误", e);
      }
    }
  }, expireDelay);
  timers.set(`expire_${todo.id}`, expireTimer);
}

function init(todos = []) {
  clearAll();
  (todos || []).forEach(scheduleTodo);
}

function add(todo) {
  scheduleTodo(todo);
}

function update(todo) {
  clearTimer(todo.id);
  clearTimer(`notify_${todo.id}`);
  clearTimer(`expire_${todo.id}`);
  scheduleTodo(todo);
}

function remove(id) {
  clearTimer(id);
  clearTimer(`notify_${id}`);
  clearTimer(`expire_${id}`);
}

function setOnExpireCallback(callback) {
  onExpireCallback = callback;
}

function clearAll() {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
}

export default {
  init,
  add,
  update,
  remove,
  clearAll,
  setOnExpireCallback,
};
