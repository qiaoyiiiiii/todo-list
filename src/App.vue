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

    <div ref="listContainerRef">
      <TodoList
        :items="virtualVisibleTodos"
        :item-height="state.itemHeight"
        :container-height="state.containerHeight"
        :total-height="totalHeight"
        :padding-top="paddingTop"
        :active-tab="state.activeTab"
        :on-scroll="handleScroll"
        :format-date="formatDate"
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
import {
  reactive,
  computed,
  ref,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
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
  getTodoTabCounts,
  getTodosByStatus,
} from './indexedDB';
import TodoList from './components/TodoList.vue';
import TodoDialog from './components/TodoDialog.vue';
import { throttle, debounce } from './utils';

const state = reactive({
  loading: false,
  currentTabTodos: [],
  activeTab: 'todo', // todo / expired / done
  sortKey: 'createdAtDesc', // createdAtDesc | dueDateAsc | priorityDesc
  filterCategory: '',
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
    console.error('获取统计失败', e);
  }
}

async function loadTodosForTab(tab = state.activeTab) {
  state.loading = true;
  try {
    let list = [];
    const now = new Date();
    if (tab === 'done') {
      list = await getTodosByStatus('done');
    } else {
      list = await getTodosByStatus('todo');
      if (tab === 'expired') {
        list = list.filter((t) => t.dueDate && new Date(t.dueDate) < now);
      } else {
        list = list.filter((t) => !(t.dueDate && new Date(t.dueDate) < now));
      }
    }
    state.currentTabTodos = list;
  } catch (e) {
    console.error('加载分组选项卡数据失败', e);
    ElMessage.error('加载失败');
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

// const paddingBottom = computed(() => {
//   if (!useVirtual.value) return 0;
//   const total = filteredTodos.value.length * state.itemHeight;
//   const visibleHeight =
//     (endIndex.value - startIndex.value) * state.itemHeight;
//   return Math.max(total - paddingTop.value - visibleHeight, 0);
// });

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
  const draft = await getDraft('new_todo').catch(() => null);
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
    await saveTodo(data);
    await deleteDraft(state.isEditingExisting ? data.id : 'new_todo');

    state.dialogVisible = false;
    state.editingTodo = null;
    state.isEditingExisting = false;
    await refreshTabCounts();
    await loadTodosForTab(state.activeTab);
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
    await deleteDraft(row.id);
    await refreshTabCounts();
    await loadTodosForTab(state.activeTab);
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
    await refreshTabCounts();
    await loadTodosForTab(state.activeTab);
    ElMessage.success('已更新状态');
  } catch (e) {
    console.error(e);
    ElMessage.error('更新失败');
  }
}

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

async function loadTodos() {
  state.loading = true;
  try {
    await loadTodosForTab(state.activeTab);
    await refreshTabCounts();
  } catch (e) {
    console.error(e);
    ElMessage.error('加载本地数据失败');
  } finally {
    state.loading = false;
  }
}

onMounted(() => {
  loadTodos();
  nextTick(() => {
    updateContainerHeight();
  });
  resizeHandler = throttle(() => updateContainerHeight(), 200);
  window.addEventListener('resize', resizeHandler);
});

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
  }
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


