<template>
  <div class="todo-list-wrapper">
    <div
      class="virtual-list-container"
      :style="{ height: containerHeight + 'px' }"
      @scroll.passive="handleScroll"
    >
      <div
        class="virtual-list-content"
        :style="{ transform: 'translateY(' + paddingTop + 'px)' }"
      >
        <template v-if="items && items.length">
          <div
            v-for="item in items"
            :key="item.id"
            :class="[
              'todo-item',
              priorityClass(item),
              { 'reminder-alert': isNearDeadline(item) },
            ]"
            :style="{ height: itemHeight - 2 + 'px' }"
          >
            <div class="todo-main">
              <div class="todo-title-row">
                <span
                  class="todo-title ellipsis"
                  :class="{ completed: item.status === 'done' }"
                  @click="$emit('edit', item)"
                >
                  {{ item.title || "(未命名待办)" }}
                </span>
                <el-tag v-if="item.category" size="small" type="warning">
                  {{ item.category }}
                </el-tag>
                <el-tag
                  size="small"
                  effect="plain"
                  :type="priorityTagType(item.priority)"
                >
                  优先级 {{ item.priority || 1 }}
                </el-tag>
              </div>
              <div v-if="item.description" class="todo-desc clamp-2">
                {{ item.description }}
              </div>
              <div class="todo-meta">
                <span v-if="item.dueDate"
                  >截止：{{ formatDate(item.dueDate) }}</span
                >
                <span v-if="item.completedAt">
                  完成时间：{{ formatDate(item.completedAt) }}
                </span>
                <span v-if="item.completeRemark"
                  >备注：{{ item.completeRemark }}</span
                >
              </div>
            </div>
            <div class="todo-actions">
              <el-button
                v-if="item.status !== 'done'"
                size="small"
                @click="$emit('edit', item)"
              >
                编辑
              </el-button>
              <el-button
                size="small"
                type="primary"
                plain
                @click="$emit('toggle-complete', item)"
              >
                <span v-if="item.status === 'done'">取消完成</span>
                <span v-else>标记完成</span>
              </el-button>
              <el-button
                size="small"
                type="danger"
                plain
                @click="$emit('delete', item)"
              >
                删除
              </el-button>
            </div>
          </div>
        </template>
        <div v-else class="todo-empty">
          <el-empty description="暂无数据"></el-empty>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import "@/styles/common.css";
import { ref, onMounted, onUnmounted } from "vue";
import { formatDate } from "../utils/index";

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  itemHeight: {
    type: Number,
    default: 82,
  },
  totalHeight: {
    type: Number,
    default: "auto",
  },
  paddingTop: {
    type: Number,
    default: 0,
  },
  activeTab: {
    type: String,
    default: "todo",
  },
  containerHeight: {
    type: Number,
    default: 520,
  },
  onScroll: {
    type: Function,
    default: null,
  },
});

const now = ref(Date.now());
let tick = null;

onMounted(() => {
  tick = setInterval(() => {
    now.value = Date.now();
  }, 5000);
});

onUnmounted(() => {
  if (tick) clearInterval(tick);
});

function handleScroll(e) {
  if (props.onScroll) {
    props.onScroll(e);
  }
}

function priorityClass(item) {
  const p = Number(item?.priority || 1);
  if (p >= 4) return "priority-high";
  if (p === 3) return "priority-mid";
  return "priority-low";
}

function priorityTagType(priority) {
  const p = Number(priority || 1);
  if (p >= 4) return "danger";
  if (p === 3) return "warning";
  return "info";
}

function isNearDeadline(item) {
  if (!item || !item.dueDate) return false;
  if (item.status === "done") return false;
  const due = new Date(item.dueDate).getTime();
  const diff = due - now.value;
  return diff > 0 && diff <= 10 * 60 * 1000;
}
</script>

<style scoped>
.todo-list-wrapper {
  margin-top: var(--spacing-md);
  border-radius: var(--border-radius-lg);
  background: var(--color-bg-primary);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-xs) 0;
}

.virtual-list-container {
  position: relative;
  height: 100%;
  overflow-y: auto;
  min-height: 200px;
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
  transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  border-left: 4px solid var(--color-info);
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-item:hover {
  background: #f7f9fc;
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
}

.priority-high {
  border-left-color: var(--color-danger);
}

.priority-mid {
  border-left-color: var(--color-warning);
}

.priority-low {
  border-left-color: var(--color-info);
}

.reminder-alert {
  background: #fff7f0;
  border-left-color: var(--color-danger) !important;
  animation: remind-pulse 2s ease-in-out infinite;
}

@keyframes remind-pulse {
  0%,
  100% {
    background: #fff7f0;
  }
  50% {
    background: #fff2e8;
  }
}

.todo-main {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  max-width: 70%;
  height: 100%;
  justify-content: space-between;
}

.todo-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.todo-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
  color: var(--color-text-primary);
}

.todo-title.completed {
  text-decoration: line-through;
  color: var(--color-text-tertiary);
  font-weight: var(--font-weight-normal);
}

.todo-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.todo-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.todo-meta span {
  background: var(--color-bg-secondary);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--border-radius-sm);
}

.todo-actions {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
}

.todo-actions .el-button {
  min-width: 86px;
}

.todo-empty {
  padding: 48px 0;
  text-align: center;
  color: var(--color-text-tertiary);
}

@media (max-width: 768px) {
  .todo-main {
    max-width: 100%;
  }

  .todo-item {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .todo-actions {
    justify-content: flex-end;
  }
}
</style>
