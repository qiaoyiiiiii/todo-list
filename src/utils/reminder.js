import { ElNotification } from "element-plus";

const TEN_MIN_MS = 10 * 60 * 1000;
const timers = new Map();

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
    console.warn("notifyTodo error", e);
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
  if (diff <= 0) return; // already passed

  const notifyDelay = diff - TEN_MIN_MS;
  if (notifyDelay <= 0) {
    notifyTodo(todo);
    return;
  }

  const t = setTimeout(() => {
    try {
      notifyTodo(todo);
    } finally {
      timers.delete(todo.id);
    }
  }, notifyDelay);

  timers.set(todo.id, t);
}

function init(todos = []) {
  clearAll();
  (todos || []).forEach(scheduleTodo);
  // also attempt to resync timers periodically (handles sleep/wake)
  // we keep a short interval to reschedule in case of clock changes
  if (!init._resync) {
    init._resync = setInterval(() => {
      (todos || []).forEach(scheduleTodo);
    }, 30 * 1000);
  }
}

function add(todo) {
  scheduleTodo(todo);
}

function update(todo) {
  // clear and reschedule according to latest data
  clearTimer(todo.id);
  scheduleTodo(todo);
}

function remove(id) {
  clearTimer(id);
}

function clearAll() {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  if (init._resync) {
    clearInterval(init._resync);
    init._resync = null;
  }
}

export default {
  init,
  add,
  update,
  remove,
  clearAll
};
