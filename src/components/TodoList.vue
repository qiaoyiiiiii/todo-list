<template>
  <div class="todo-list-wrapper">
    <div
      class="virtual-list-container"
      :style="{ height: containerHeight + 'px' }"
      @scroll.passive="handleScroll"
    >
      <div
        class="virtual-list-phantom"
        :style="{ height: totalHeight }"
      ></div>
      <div
        class="virtual-list-content"
        :style="{ transform: 'translateY(' + paddingTop + 'px)' }"
      >
        <template v-if="items && items.length">
          <div
            v-for="item in items"
            :key="item.id"
            :class="['todo-item', priorityClass(item)]"
            :style="{ height: itemHeight - 2 + 'px' }"
          >
            <div class="todo-main">
              <div class="todo-title-row">
                <span
                  class="todo-title ellipsis"
                  :class="{ completed: item.status === 'done' }"
                  @click="$emit('edit', item)"
                >
                  {{ item.title || '(未命名待办)' }}
                </span>
                <el-tag
                  size="small"
                  :type="
                    item.status === 'done'
                      ? 'success'
                      : activeTab === 'expired'
                        ? 'danger'
                        : 'info'
                  "
                >
                  <span v-if="item.status === 'done'">已完成</span>
                  <span v-else-if="activeTab === 'expired'">已过期</span>
                  <span v-else>待办</span>
                </el-tag>
                <el-tag
                  v-if="item.category"
                  size="small"
                  type="warning"
                >
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
              <div
                v-if="item.description"
                class="todo-desc clamp-2"
              >
                {{ item.description }}
              </div>
              <div class="todo-meta">
                <span v-if="item.dueDate">截止：{{ formatDate(item.dueDate) }}</span>
                <span v-if="item.completedAt">
                  完成时间：{{ formatDate(item.completedAt) }}
                </span>
                <span v-if="item.completeRemark">备注：{{ item.completeRemark }}</span>
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
    type: String,
    default: 'auto',
  },
  paddingTop: {
    type: Number,
    default: 0,
  },
  activeTab: {
    type: String,
    default: 'todo',
  },
  containerHeight: {
    type: Number,
    default: 520,
  },
  onScroll: {
    type: Function,
    default: null,
  },
  formatDate: {
    type: Function,
    required: true,
  },
});

function handleScroll(e) {
  if (props.onScroll) {
    props.onScroll(e);
  }
}

function priorityClass(item) {
  const p = Number(item?.priority || 1);
  if (p >= 4) return 'priority-high';
  if (p === 3) return 'priority-mid';
  return 'priority-low';
}

function priorityTagType(priority) {
  const p = Number(priority || 1);
  if (p >= 4) return 'danger';
  if (p === 3) return 'warning';
  return 'info';
}
</script>

<style scoped>
.todo-list-wrapper {
  margin-top: 12px;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 4px 0;
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
  padding: 12px 20px;
  border-bottom: 1px solid #f2f2f2;
  transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  border-left: 4px solid #dcdfe6;
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-item:hover {
  background: #f7f9fc;
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.05);
}

.priority-high {
  border-left-color: #f56c6c;
}

.priority-mid {
  border-left-color: #e6a23c;
}

.priority-low {
  border-left-color: #909399;
}

.todo-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 70%;
}

.todo-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.todo-title {
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  color: #303133;
}

.todo-title.completed {
  text-decoration: line-through;
  color: #999;
  font-weight: 500;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-desc {
  font-size: 13px;
  color: #606266;
}

.clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.todo-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}

.todo-meta span {
  background: #f5f7fa;
  padding: 4px 8px;
  border-radius: 6px;
}

.todo-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.todo-actions .el-button {
  min-width: 86px;
}

.todo-empty {
  padding: 48px 0;
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

