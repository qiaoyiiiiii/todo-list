<template>
  <el-dialog
    v-model="visible"
    :title="isEditingExisting ? '编辑待办事项' : '新建待办事项'"
    width="600px"
    @close="handleClose"
  >
    <div v-if="todo">
      <el-form label-width="90px" :model="todo">
        <el-form-item label="标题" required>
          <el-input v-model="todo.title" placeholder="请输入标题" clearable />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="todo.description"
            type="textarea"
            :rows="4"
            placeholder="可选：补充一些说明"
          />
        </el-form-item>
        <el-form-item label="分类">
          <el-select
            v-model="todo.category"
            allow-create
            filterable
            clearable
            default-first-option
            placeholder="选择或输入分类，如 工作 / 学习 / 生活"
          >
            <el-option
              v-for="c in distinctCategories"
              :key="c"
              :label="c"
              :value="c"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-slider
            v-model="todo.priority"
            :min="1"
            :max="5"
            :step="1"
            show-stops
          />
        </el-form-item>
        <el-form-item label="截止时间">
          <el-date-picker
            v-model="todo.dueDate"
            type="datetime"
            placeholder="可选：选择截止时间"
          />
        </el-form-item>
      </el-form>
      <div style="font-size: 12px; color: #909399; margin-top: 8px">
        编辑内容会自动定时保存到 IndexedDB，本地刷新/断网不丢失<br />
        点击esc清空所有内容
      </div>
    </div>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取 消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveClick">
          保 存
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, watch, onUnmounted } from "vue";
import { ElMessage } from "element-plus";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  todo: {
    type: Object,
    default: null,
  },
  distinctCategories: {
    type: Array,
    default: () => [],
  },
  saving: {
    type: Boolean,
    default: false,
  },
  isEditingExisting: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue", "save", "close"]);

const visible = computed({
  get() {
    return props.modelValue;
  },
  set(val) {
    emit("update:modelValue", val);
  },
});

function handleClose() {
  emit("update:modelValue", false);
  emit("close");
}

function handleSaveClick() {
  const todo = props.todo;
  if (todo && todo.dueDate) {
    const now = new Date();
    const due = new Date(todo.dueDate);
    if (due.getTime() < now.getTime()) {
      ElMessage.error("截止时间必须大于等于当前时间一分钟以上");
      return;
    }
  }
  if (!todo || !todo.title) {
    ElMessage.warning("标题不能为空");
    return;
  }
  emit("save");
}

function clearInputs() {
  const t = props.todo;
  if (!t) return;
  t.title = "";
  t.description = "";
  t.category = "";
  t.priority = 1;
  t.dueDate = "";
  t.status = "todo";
  t.completeRemark = "";
  t.completedAt = "";
}

function onKeydownEsc(e) {
  if (e.key === "Escape" || e.key === "Esc") {
    if (props.modelValue) {
      e.preventDefault();
      e.stopImmediatePropagation();
      clearInputs();
    }
  }
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      document.addEventListener("keydown", onKeydownEsc, true);
    } else {
      document.removeEventListener("keydown", onKeydownEsc, true);
    }
  }
);

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydownEsc, true);
});
</script>
