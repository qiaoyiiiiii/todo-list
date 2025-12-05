import dayjs from "dayjs";
import { ElMessage } from "element-plus";

export function showError(err, opts = {}) {
  console.error(err);
  let msg = opts.defaultMsg || "发生错误";
  if (typeof err === "string") msg = err;
  else if (err && typeof err.message === "string") msg = err.message;
  else if (err && typeof err.toString === "function") msg = err.toString();
  ElMessage.error(msg);
}

export function throttle(fn, delay) {
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

export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

export function formatDate(value) {
  if (!value) return "";
  return dayjs(value).format("YYYY-MM-DD HH:mm");
}

export default {
  showError,
  throttle,
  debounce,
};
