export function createDraftRegistry() {
  const checks = new Map<string, () => boolean>();
  return {
    set: (id: string, check: () => boolean) => checks.set(id, check),
    delete: (id: string) => checks.delete(id),
    has: () => [...checks.values()].some((check) => check()),
  };
}
export const draftRegistry = createDraftRegistry();
export function installDraftNavigationGuard(
  win: Window,
  doc: Document,
  dirty: () => boolean,
  confirm: () => boolean,
) {
  const unload = (event: BeforeUnloadEvent) => {
    if (dirty()) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  const click = (event: MouseEvent) => {
    const link = (event.target as Element)?.closest?.(
      "a[href]",
    ) as HTMLAnchorElement | null;
    if (
      !link ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.target === "_blank" ||
      link.hasAttribute("download")
    )
      return;
    const url = new URL(link.href, win.location.href);
    if (
      url.href === win.location.href ||
      (url.pathname === win.location.pathname &&
        url.search === win.location.search &&
        url.hash)
    )
      return;
    if (dirty() && !confirm()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  let index = Number.isSafeInteger(win.history.state?.__wahoDraftIndex)
      ? win.history.state.__wahoDraftIndex
      : 0,
    restoring = false;
  const push = win.history.pushState.bind(win.history),
    replace = win.history.replaceState.bind(win.history);
  replace({ ...win.history.state, __wahoDraftIndex: index }, "");
  win.history.pushState = (data, unused, url) => {
    index++;
    push({ ...data, __wahoDraftIndex: index }, unused, url);
  };
  win.history.replaceState = (data, unused, url) =>
    replace({ ...data, __wahoDraftIndex: index }, unused, url);
  const pop = (event: PopStateEvent) => {
    const next =
      typeof event.state?.__wahoDraftIndex === "number"
        ? event.state.__wahoDraftIndex
        : index - 1;
    if (restoring) {
      restoring = false;
      event.stopImmediatePropagation();
      return;
    }
    if (dirty() && !confirm()) {
      event.stopImmediatePropagation();
      restoring = true;
      win.history.go(index - next || 1);
      return;
    }
    index = next;
  };
  win.addEventListener("beforeunload", unload);
  doc.addEventListener("click", click, true);
  win.addEventListener("popstate", pop, true);
  return () => {
    win.removeEventListener("beforeunload", unload);
    doc.removeEventListener("click", click, true);
    win.removeEventListener("popstate", pop, true);
    win.history.pushState = push;
    win.history.replaceState = replace;
  };
}
