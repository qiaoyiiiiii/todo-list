<template>
  <div class="todo-container">
    <div class="todo-header">
      <div class="todo-header-title">
        <span>TODO List</span>
      </div>
      <el-button type="primary" @click="openCreateDialog">
        新建待办
      </el-button>
    </div>

    <div class="todo-filters">
      <el-radio-group
        :model-value="state.activeTab"
        @change="handleTabChange"
      >
        <el-radio-button label="todo">
          待办 ({{ tabCounts.todo }})
        </el-radio-button>
        <el-radio-button label="expired">
          已过期 ({{ tabCounts.expired }})
        </el-radio-button>
        <el-radio-button label="done">
          已完成 ({{ tabCounts.done }})
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
        <el-option label="按创建时间（新 -> 旧）" value="createdAtDesc" />
        <el-option label="按截止日期（早 -> 晚）" value="dueDateAsc" />
        <el-option label="按优先级（高 -> 低）" value="priorityDesc" />
      </el-select>
    </div>

    <TodoList
      :items="virtualVisibleTodos"
      :item-height="state.itemHeight"
      :total-height="totalHeight"
      :padding-top="paddingTop"
      :active-tab="state.activeTab"
      :on-scroll="handleScroll"
      :format-date="formatDate"
      @edit="openEditDialog"
      @toggle-complete="toggleComplete"
      @delete="handleDelete"
    />

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
import {
  reactive,
  computed,
  ref,
  watch,
  onMounted,
} from 'vue';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getAllTodos,
  saveTodo,
  deleteTodo,
  getDraft,
  saveDraft,
  deleteDraft,
} from './indexedDB';
import TodoList from './components/TodoList.vue';
import TodoDialog from './components/TodoDialog.vue';

// 简单节流函数：用于 Tab 点击
function throttle(fn, delay) {
  let last = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      fn.apply(this, args);
    } else if (!timer) {
      const remaining = delay - (now - last);
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

// 防抖函数：用于编辑自动保存
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

const state = reactive({
  loading: false,
  todos: [],
  activeTab: 'todo', // todo / expired / done
  sortKey: 'createdAtDesc', // createdAtDesc | dueDateAsc | priorityDesc
  filterCategory: '',

  dialogVisible: false,
  editingTodo: null,
  isEditingExisting: false,
  saving: false,

  // 虚拟列表相关（交给 TodoList 使用）
  enableVirtual: true,
  itemHeight: 82,
  containerHeight: 520,
  scrollTop: 0,
});

const tabCounts = computed(() => {
  let todo = 0;
  let expired = 0;
  let done = 0;
  const now = new Date();
  state.todos.forEach((t) => {
    if (t.status === 'done') {
      done += 1;
    } else if (t.dueDate && new Date(t.dueDate) < now) {
      expired += 1;
    } else {
      todo += 1;
    }
  });
  return { todo, expired, done };
});

const distinctCategories = computed(() => {
  const set = new Set();
  state.todos.forEach((t) => {
    if (t.category) set.add(t.category);
  });
  return Array.from(set);
});

function sortTodos(list) {
  const arr = [...list];
  if (state.sortKey === 'createdAtDesc') {
    arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } else if (state.sortKey === 'dueDateAsc') {
    arr.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  } else if (state.sortKey === 'priorityDesc') {
    arr.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }
  return arr;
}

const filteredTodos = computed(() => {
  const now = new Date();
  let list = state.todos.filter((t) => {
    if (state.filterCategory && t.category !== state.filterCategory) {
      return false;
    }
    if (state.activeTab === 'done') {
      return t.status === 'done';
    }
    if (state.activeTab === 'expired') {
      return t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now;
    }
    // todo
    return !(
      t.status === 'done' ||
      (t.dueDate && new Date(t.dueDate) < now)
    );
  });
  return sortTodos(list);
});

const useVirtual = computed(() => {
  return state.enableVirtual && filteredTodos.value.length > 30;
});

const visibleCount = computed(() => {
  return Math.ceil(state.containerHeight / state.itemHeight) + 4;
});

const startIndex = computed(() => {
  if (!useVirtual.value) return 0;
  const idx = Math.floor(state.scrollTop / state.itemHeight);
  return Math.max(0, Math.min(idx, Math.max(filteredTodos.value.length - 1, 0)));
});

const endIndex = computed(() => {
  if (!useVirtual.value) return filteredTodos.value.length;
  return Math.min(
    filteredTodos.value.length,
    startIndex.value + visibleCount.value,
  );
});

const virtualVisibleTodos = computed(() => {
  if (!useVirtual.value) return filteredTodos.value;
  return filteredTodos.value.slice(startIndex.value, endIndex.value);
});

const paddingTop = computed(() => {
  if (!useVirtual.value) return 0;
  return startIndex.value * state.itemHeight;
});

const paddingBottom = computed(() => {
  if (!useVirtual.value) return 0;
  const total = filteredTodos.value.length * state.itemHeight;
  const visibleHeight =
    (endIndex.value - startIndex.value) * state.itemHeight;
  return Math.max(total - paddingTop.value - visibleHeight, 0);
});

const totalHeight = computed(() => {
  if (!useVirtual.value) {
    return 'auto';
  }
  return `${filteredTodos.value.length * state.itemHeight}px`;
});

function handleScroll(e) {
  if (!useVirtual.value) return;
  const target = e.target;
  state.scrollTop = target.scrollTop;
}

// Tab 点击节流
const changeTabThrottled = throttle((val) => {
  state.activeTab = val;
}, 400);

function handleTabChange(val) {
  changeTabThrottled(val);
}

function newEmptyTodo() {
  return {
    id: `todo_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    title: '',
    description: '',
    category: '',
    priority: 1,
    dueDate: '',
    status: 'todo',
    completeRemark: '',
    completedAt: '',
  };
}

async function openCreateDialog() {
  state.isEditingExisting = false;
  const todo = newEmptyTodo();
  // 尝试恢复新建草稿
  const draft = await getDraft('new_todo').catch(() => null);
  if (draft && draft.content) {
    Object.assign(todo, draft.content);
  }
  state.editingTodo = reactive({ ...todo });
  state.dialogVisible = true;
}

async function openEditDialog(row) {
  state.isEditingExisting = true;
  // 已完成的不允许编辑
  if (row.status === 'done') {
    ElMessage.warning('已完成的任务不可编辑，如需修改请先取消完成状态');
    return;
  }
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
  if (!state.editingTodo || !state.editingTodo.title) {
    ElMessage.warning('标题不能为空');
    return;
  }
  state.saving = true;
  try {
    const data = { ...state.editingTodo };
    await saveTodo(data);

    const index = state.todos.findIndex((t) => t.id === data.id);
    if (index === -1) {
      state.todos.unshift(data);
    } else {
      state.todos.splice(index, 1, data);
    }

    // 删除草稿
    await deleteDraft(state.isEditingExisting ? data.id : 'new_todo');

    state.dialogVisible = false;
    // 保存后不再保留编辑状态，避免继续触发编辑内容存储
    state.editingTodo = null;
    state.isEditingExisting = false;
    ElMessage.success('保存成功');
  } catch (e) {
    console.error(e);
    ElMessage.error('保存失败');
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
    await ElMessageBox.confirm(
      '确认删除该待办事项吗？',
      '提示',
      {
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  try {
    await deleteTodo(row.id);
    const index = state.todos.findIndex((t) => t.id === row.id);
    if (index !== -1) state.todos.splice(index, 1);
    await deleteDraft(row.id);
    ElMessage.success('已删除');
  } catch (e) {
    console.error(e);
    ElMessage.error('删除失败');
  }
}

async function toggleComplete(row) {
  const copy = { ...row };
  if (row.status === 'done') {
    copy.status = 'todo';
    copy.completeRemark = '';
    copy.completedAt = '';
  } else {
    let value = '';
    try {
      const res = await ElMessageBox.prompt(
        '可以填写完成备注（可选）：',
        '标记完成',
        {
          inputPlaceholder: '比如：已提交、已复习完等',
          inputType: 'textarea',
          showCancelButton: true,
          confirmButtonText: '确定',
          cancelButtonText: '取消',
        },
      );
      value = res.value || '';
    } catch {
      return;
    }

    copy.status = 'done';
    copy.completeRemark = value;
    copy.completedAt = new Date().toISOString();
  }

  try {
    await saveTodo(copy);
    const index = state.todos.findIndex((t) => t.id === copy.id);
    if (index !== -1) {
      state.todos.splice(index, 1, copy);
    }
    ElMessage.success('已更新状态');
  } catch (e) {
    console.error(e);
    ElMessage.error('更新失败');
  }
}

// 编辑自动保存草稿
const saveDraftDebounced = debounce(async (todo) => {
  if (!todo) return;
  const key = state.isEditingExisting ? todo.id : 'new_todo';
  try {
    await saveDraft(key, {
      ...todo,
    });
  } catch (e) {
    console.error('自动保存草稿失败', e);
  }
}, 800);

watch(
  () => (state.editingTodo ? { ...state.editingTodo } : null),
  (val) => {
    if (!val) return;
    saveDraftDebounced(val);
  },
  { deep: true },
);

// 初始化从 IndexedDB 读取
async function loadTodos() {
  state.loading = true;
  try {
    const list = await getAllTodos();
    list.sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || ''),
    );
    state.todos = list;
  } catch (e) {
    console.error(e);
    ElMessage.error('加载本地数据失败');
  } finally {
    state.loading = false;
  }
}

onMounted(() => {
  loadTodos();
});

function formatDate(value) {
  if (!value) return '';
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}
</script>

<style scoped>
html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', sans-serif;
  background-color: #f5f7fa;
}

.todo-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 24px 24px;
}

.todo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.todo-header-title {
  font-size: 24px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.todo-filters {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.todo-list-wrapper {
  margin-top: 12px;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  padding: 8px 0;
}

.virtual-list-container {
  position: relative;
  height: 520px;
  overflow-y: auto;
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
  padding: 10px 20px;
  border-bottom: 1px solid #f2f2f2;
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 70%;
}

.todo-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.todo-title {
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}

.todo-title.completed {
  text-decoration: line-through;
  color: #999;
}

.todo-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}

.todo-actions {
  display: flex;
  gap: 8px;
}

.todo-empty {
  padding: 40px 0;
  text-align: center;
  color: #c0c4cc;
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


