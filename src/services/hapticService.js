export const Haptics = {
  tap() {
    vibrate(8);
  },
  success() {
    vibrate([10, 24, 16]);
  },
  warning() {
    vibrate([18, 30, 18]);
  }
};

function vibrate(pattern) {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}
