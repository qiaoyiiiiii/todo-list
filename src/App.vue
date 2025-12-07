<template>
  <div class="todo-container">
    <div class="todo-header">
      <div class="todo-header-title">
        <span>TODO List</span>
        <el-button @click="importData">导入数据</el-button>
      </div>
      <el-button type="primary" @click="openCreateDialog"> 新建待办 </el-button>
    </div>

    <div class="todo-filters">
      <el-radio-group :model-value="state.activeTab" @change="handleTabChange">
        <el-radio-button label="todo">
          待办 ({{ state.tabCounts.todo }})
        </el-radio-button>
        <el-radio-button label="expired">
          已过期 ({{ state.tabCounts.expired }})
        </el-radio-button>
        <el-radio-button label="done">
          已完成 ({{ state.tabCounts.done }})
        </el-radio-button>
      </el-radio-group>

      <el-select
        v-model="state.filterCategory"
        clearable
        placeholder="按分类筛选"
        style="width: 160px"
      >
        <el-option
          v-for="c in distinctCategories"
          :key="c"
          :label="c"
          :value="c"
        />
      </el-select>

      <el-select
        v-model="state.sortKey"
        placeholder="排序方式"
        style="width: 180px"
      >
        <el-option label="按创建时间" value="createdAtDesc" />
        <el-option label="按截止日期" value="dueDateAsc" />
        <el-option label="按优先级" value="priorityDesc" />
      </el-select>
    </div>

    <div
      ref="listContainerRef"
      :style="{ height: state.containerHeight + 'px', overflowy: 'auto' }"
    >
      <TodoList
        :items="virtualVisibleTodos"
        :item-height="state.itemHeight"
        :container-height="state.containerHeight"
        :total-height="totalHeight"
        :padding-top="paddingTop"
        :active-tab="state.activeTab"
        :on-scroll="handleScroll"
        @edit="openEditDialog"
        @toggle-complete="toggleComplete"
        @delete="handleDelete"
      />
    </div>

    <TodoDialog
      v-model="state.dialogVisible"
      :todo="state.editingTodo"
      :distinct-categories="distinctCategories"
      :saving="state.saving"
      :is-editing-existing="state.isEditingExisting"
      @save="confirmSave"
      @close="handleDialogClose"
    />
  </div>
</template>

<script setup>
import "@/styles/common.css";
import {
  reactive,
  computed,
  ref,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
} from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  getAllTodos,
  saveTodo,
  deleteTodo,
  getDraft,
  saveDraft,
  deleteDraft,
  getTodoTabCounts,
  getTodosByStatus,
} from "./indexedDB";
import { saveWithTransaction } from "./indexedDB";
import TodoList from "./components/TodoList.vue";
import TodoDialog from "./components/TodoDialog.vue";
import { throttle, debounce, showError } from "./utils";
import reminder from "./utils/reminder";
import { runImport } from "./utils/importData";

const state = reactive({
  loading: false,
  currentTabTodos: [],
  activeTab: "todo", // todo / expired / done
  sortKey: "createdAtDesc", // createdAtDesc | dueDateAsc | priorityDesc
  filterCategory: "",
  tabCounts: { todo: 0, expired: 0, done: 0 },

  dialogVisible: false,
  editingTodo: null,
  isEditingExisting: false,
  saving: false,

  // 虚拟列表
  enableVirtual: true,
  itemHeight: 82,
  containerHeight: 520,
  scrollTop: 0,
});

const listContainerRef = ref(null);
let resizeHandler = null;
let visibilityHandler = null;

const distinctCategories = computed(() => {
  const set = new Set();
  state.currentTabTodos.forEach((t) => {
    if (t.category) set.add(t.category);
  });
  return Array.from(set);
});

async function refreshTabCounts() {
  try {
    const counts = await getTodoTabCounts();
    state.tabCounts = counts;
  } catch (e) {
    showError(e, { defaultMsg: "获取统计失败" });
  }
}

async function loadTodosForTab(tab = state.activeTab) {
  state.loading = true;
  try {
    let list = [];
    const now = new Date();
    if (tab === "done") {
      list = await getTodosByStatus("done");
    } else {
      list = await getTodosByStatus("todo");
      if (tab === "expired") {
        list = list.filter((t) => t.dueDate && new Date(t.dueDate) < now);
      } else {
        list = list.filter((t) => !(t.dueDate && new Date(t.dueDate) < now));
      }
    }
    state.currentTabTodos = list;
  } catch (e) {
    showError(e, { defaultMsg: "加载失败" });
  } finally {
    state.loading = false;
  }
}

function updateContainerHeight() {
  const box = listContainerRef.value;
  if (!box) return;
  const rect = box.getBoundingClientRect();
  const margin = 24;
  const h = window.innerHeight - rect.top - margin;
  state.containerHeight = Math.max(260, Math.floor(h));
}

function createComparator(sortKey) {
  return (a, b) => {
    if (sortKey === "createdAtDesc") {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    } else if (sortKey === "dueDateAsc") {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      const timeA = new Date(a.dueDate).getTime();
      const timeB = new Date(b.dueDate).getTime();
      return timeA - timeB;
    } else if (sortKey === "priorityDesc") {
      return (b.priority || 0) - (a.priority || 0);
    }
    return 0;
  };
}

function sortTodos(list) {
  const arr = [...list];
  arr.sort(createComparator(state.sortKey));
  return arr;
}

const filteredTodos = computed(() => {
  let list = state.currentTabTodos || [];
  if (state.filterCategory) {
    list = list.filter((t) => t.category === state.filterCategory);
  }
  return sortTodos(list);
});

//虚拟列表
const useVirtual = computed(() => {
  return state.enableVirtual && filteredTodos.value.length > 30;
});

const visibleCount = computed(() => {
  return Math.ceil(state.containerHeight / state.itemHeight) + 4;
});

const startIndex = computed(() => {
  if (!useVirtual.value) return 0;
  const idx = Math.floor(state.scrollTop / state.itemHeight);
  const maxStart = Math.max(filteredTodos.value.length - visibleCount.value, 0);
  return Math.max(0, Math.min(idx, maxStart));
});

const endIndex = computed(() => {
  if (!useVirtual.value) return filteredTodos.value.length;
  const end = startIndex.value + visibleCount.value;
  return Math.min(filteredTodos.value.length, Math.max(end, startIndex.value));
});

const virtualVisibleTodos = computed(() => {
  if (!useVirtual.value) return filteredTodos.value;
  const s = Math.max(0, startIndex.value);
  const e = Math.max(s, endIndex.value);
  return filteredTodos.value.slice(s, e);
});

const paddingTop = computed(() => {
  if (!useVirtual.value) return 0;
  return startIndex.value * state.itemHeight;
});

// const paddingBottom = computed(() => {
//   if (!useVirtual.value) return 0;
//   const total = filteredTodos.value.length * state.itemHeight;
//   const visibleHeight = (endIndex.value - startIndex.value) * state.itemHeight;
//   return Math.max(total - paddingTop.value - visibleHeight, 0);
// });

const totalHeight = computed(() => {
  return filteredTodos.value.length * state.itemHeight;
});

function handleScroll(e) {
  if (!useVirtual.value) return;
  const target = e.target;
  state.scrollTop = target.scrollTop;
}

const changeTabThrottled = throttle((val) => {
  state.activeTab = val;
  state.scrollTop = 0;
  loadTodosForTab(val);
}, 400);

function handleTabChange(val) {
  changeTabThrottled(val);
}

function newEmptyTodo() {
  return {
    id: `todo_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    title: "",
    description: "",
    category: "",
    priority: 1,
    dueDate: "",
    status: "todo",
    completeRemark: "",
    completedAt: "",
  };
}

async function openCreateDialog() {
  state.isEditingExisting = false;
  const todo = newEmptyTodo();
  const draft = await getDraft("new_todo").catch(() => null);
  if (draft && draft.content) {
    Object.assign(todo, draft.content);
  }
  state.editingTodo = reactive({ ...todo });
  state.dialogVisible = true;
}

async function openEditDialog(row) {
  state.isEditingExisting = true;
  const copy = {
    ...row,
  };
  const draft = await getDraft(row.id).catch(() => null);
  if (draft && draft.content) {
    Object.assign(copy, draft.content);
  }
  state.editingTodo = reactive(copy);
  state.dialogVisible = true;
}

async function confirmSave() {
  state.saving = true;
  try {
    const data = { ...state.editingTodo };
    const draftKey = state.isEditingExisting ? data.id : "new_todo";
    await saveWithTransaction(data, draftKey);

    state.dialogVisible = false;
    state.editingTodo = null;
    state.isEditingExisting = false;
    await refreshTabCounts();
    await loadTodosForTab(state.activeTab);

    try {
      reminder.update(data);
    } catch (e) {
      showError(e, { defaultMsg: "更新提醒失败" });
    }

    ElMessage.success("保存成功");
  } catch (e) {
    showError(e, { defaultMsg: "保存失败" });
  } finally {
    state.saving = false;
  }
}

function handleDialogClose() {
  state.dialogVisible = false;
  state.editingTodo = null;
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm("确认删除该待办事项吗？", "提示", {
      type: "warning",
    });
  } catch {
    return;
  }

  try {
    try {
      reminder.remove(row.id);
    } catch (e) {}
    await deleteTodo(row.id);
    await deleteDraft(row.id);
    await refreshTabCounts();
    await loadTodosForTab(state.activeTab);
    ElMessage.success("已删除");
  } catch (e) {
    showError(e, { defaultMsg: "删除失败" });
  }
}

async function toggleComplete(row) {
  const copy = { ...row };
  if (row.status === "done") {
    copy.status = "todo";
    copy.completeRemark = "";
    copy.completedAt = "";
  } else {
    let value = "";
    try {
      const res = await ElMessageBox.prompt(
        "可以填写完成备注（可选）：",
        "标记完成",
        {
          inputPlaceholder: "比如：已提交、已复习完等",
          inputType: "textarea",
          showCancelButton: true,
          confirmButtonText: "确定",
          cancelButtonText: "取消",
        }
      );
      value = res.value || "";
    } catch {
      return;
    }

    copy.status = "done";
    copy.completeRemark = value;
    copy.completedAt = new Date().toISOString();
  }

  try {
    await saveTodo(copy);
    await refreshTabCounts();
    await loadTodosForTab(state.activeTab);

    try {
      if (copy.status === "done") {
        reminder.remove(copy.id);
      } else {
        reminder.update(copy);
      }
    } catch (e) {
      showError(e, { defaultMsg: "更新提醒调度失败" });
    }

    ElMessage.success("已更新状态");
  } catch (e) {
    showError(e, { defaultMsg: "更新失败" });
  }
}

const saveDraftDebounced = debounce(async (todo) => {
  if (!todo) return;
  const key = state.isEditingExisting ? todo.id : "new_todo";
  try {
    await saveDraft(key, {
      ...todo,
    });
  } catch (e) {
    showError(e, { defaultMsg: "自动保存草稿失败" });
  }
}, 800);

watch(
  () => (state.editingTodo ? { ...state.editingTodo } : null),
  (val) => {
    if (!val) return;
    saveDraftDebounced(val);
  },
  { deep: true }
);

async function loadTodos() {
  state.loading = true;
  try {
    await loadTodosForTab(state.activeTab);
    await refreshTabCounts();
  } catch (e) {
    showError(e, { defaultMsg: "加载本地数据失败" });
  } finally {
    state.loading = false;
  }
}

async function checkAndRefreshExpired() {
  try {
    await refreshTabCounts();
    await loadTodosForTab(state.activeTab);
  } catch (e) {
    showError(e, { defaultMsg: "定时刷新失败" });
  }
}

async function onTodoExpire(todoId) {
  try {
    await checkAndRefreshExpired();
  } catch (e) {
    showError(e, { defaultMsg: "任务过期更新失败" });
  }
}

onMounted(() => {
  loadTodos();
  nextTick(() => {
    updateContainerHeight();
  });
  resizeHandler = throttle(() => updateContainerHeight(), 200);
  window.addEventListener("resize", resizeHandler);

  try {
    visibilityHandler = () => {
      if (!document.hidden) {
        checkAndRefreshExpired().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);
  } catch (e) {
    showError(e, { defaultMsg: "启动可见性检查失败" });
  }

  try {
    reminder.setOnExpireCallback(onTodoExpire);
    loadTodosForTab("todo")
      .then((all) => {
        if (Array.isArray(all)) reminder.init(all);
      })
      .catch(() => {});
  } catch (e) {
    console.warn("reminder init error", e);
  }
});

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
  }
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
});
async function importData() {
  try {
    await runImport();
    ElMessage.success("数据导入成功！");
    // 导入完成后刷新显示
    await loadTodos();
    await refreshTabCounts();
  } catch (e) {
    showError(e, { defaultMsg: "数据导入失败" });
  }
}

</script>

<style scoped>
html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: var(--font-family);
  background-color: var(--color-bg-secondary);
}

.todo-container {
  max-width: 80vw;
  margin: 0 auto;
}

.todo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.todo-header-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.todo-filters {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
  flex-wrap: wrap;
}

.todo-list-wrapper {
  margin-top: var(--spacing-md);
  border-radius: var(--border-radius-md);
  background: var(--color-bg-primary);
  box-shadow: var(--shadow-sm);
  padding: var(--spacing-xs) 0;
}

.virtual-list-phantom {
  height: 100%;
}

.virtual-list-content {
  position: absolute;
  left: 0;
  right: 0;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-main {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  max-width: 70%;
}

.todo-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.todo-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-normal);
  cursor: pointer;
  color: var(--color-text-primary);
}

.todo-title.completed {
  text-decoration: line-through;
  color: var(--color-text-tertiary);
}

.todo-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.todo-actions {
  display: flex;
  gap: var(--spacing-md);
}

.todo-empty {
  padding: 40px 0;
  text-align: center;
  color: var(--color-text-tertiary);
}

@media (max-width: 768px) {
  .todo-main {
    max-width: 100%;
  }

  .todo-item {
    flex-direction: column;
    gap: 8px;
  }

  .todo-actions {
    justify-content: flex-end;
  }
}
</style>
