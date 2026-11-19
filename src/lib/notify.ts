export function notify(
  message: string,
  tone: "success" | "error" | "info" = "info",
) {
  if (!message || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("course-atlas:toast", { detail: { message, tone } }),
  );
}
