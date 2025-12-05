<template>
  <div class="todo-list-wrapper">
    <div
      class="virtual-list-container"
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
            class="todo-item"
            :style="{ height: itemHeight - 2 + 'px' }"
          >
            <div class="todo-main">
              <div class="todo-title-row">
                <span
                  class="todo-title"
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
              </div>
              <div
                v-if="item.description"
                style="font-size: 13px; color: #606266"
              >
                {{ item.description }}
              </div>
              <div class="todo-meta">
                <span>优先级：{{ item.priority || 1 }}</span>
                <span v-if="item.dueDate">截止：{{ formatDate(item.dueDate) }}</span>
                <span v-if="item.completedAt">
                  完成时间：{{ formatDate(item.completedAt) }}
                </span>
                <span v-if="item.completeRemark">备注：{{ item.completeRemark }}</span>
              </div>
            </div>
            <div class="todo-actions">
              <el-button size="small" @click="$emit('edit', item)">
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
</script>


