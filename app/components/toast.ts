// =========================================================================
// components/toast.ts — Toast notification system
// =========================================================================

type ToastType = "success" | "error" | "info";

export function toast(message: string, type: ToastType = "info", duration = 3500) {
  const container = document.getElementById("toast-container")!;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    el.style.transition = "all 200ms ease";
    setTimeout(() => el.remove(), 200);
  }, duration);
}
