"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Dialog } from "radix-ui";
import { Download, LaptopMinimal, LoaderCircle } from "lucide-react";
import { browserModel } from "./browser-model-store";
import { useGuideExitGuard } from "./use-guide-exit-guard";
import styles from "./browser-model-download.module.css";

export function BrowserModelDownload() {
  useEffect(() => () => browserModel.cancel(), []);
  const download = useSyncExternalStore(
    browserModel.subscribe,
    browserModel.getDownload,
    browserModel.getServerDownload,
  );
  const canConfirm = useGuideExitGuard(
    `${download?.sourceLanguage}:${download?.targetLanguage}:${download?.stage}`,
  );
  useEffect(() => {
    const container = download?.container;
    if (!container) return;
    const observer = new MutationObserver(() => {
      if (!container.isConnected) browserModel.cancel();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [download?.container]);
  const zh = download?.locale === "zh";
  const busy = download?.stage === "downloading";
  const error = download?.stage === "error";
  const fraction = download?.progress.fraction;
  const percent = fraction == null ? null : Math.round(fraction * 100);
  const bytes = download?.progress.totalBytes;
  const megabytes = bytes
    ? `${(bytes / 1024 / 1024).toLocaleString(zh ? "zh-CN" : "en", { maximumFractionDigits: 1 })} MB`
    : null;
  return (
    <Dialog.Root
      open={download !== null}
      onOpenChange={(open) => {
        if (!open) browserModel.cancel();
      }}
    >
      <Dialog.Portal container={download?.container}>
        <Dialog.Overlay className={styles.overlay} data-translation-popover />
        <Dialog.Content
          className={styles.dialog}
          data-translation-download
          data-translation-popover
          onClick={(event) => event.stopPropagation()}
        >
          <span className={styles.icon}>
            <LaptopMinimal size={22} aria-hidden="true" />
          </span>
          <Dialog.Title className={styles.title}>
            {zh ? "下载本机翻译模型？" : "Download the on-device model?"}
          </Dialog.Title>
          <Dialog.Description className={styles.description}>
            {zh
              ? "首次使用需下载 Google 翻译模型，之后可在本机翻译。"
              : "Download Google's translation model once to translate on this device."}
          </Dialog.Description>
          <p className={styles.size}>
            {megabytes
              ? zh
                ? `下载大小：${megabytes}`
                : `Download size: ${megabytes}`
              : zh
                ? "大小由 Chrome 决定，暂无法提前获取。"
                : "Chrome determines the size; it isn't available in advance."}
          </p>
          {busy ? (
            <div
              className={styles.progress}
              role="progressbar"
              aria-label={zh ? "模型下载进度" : "Model download progress"}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
            >
              <span>
                <span style={{ width: `${percent ?? 0}%` }} />
              </span>
              <p role="status">
                <LoaderCircle
                  size={13}
                  className={styles.spinner}
                  aria-hidden="true"
                />
                {zh ? "正在准备 Google 模型" : "Preparing Google's model"}
                {percent == null ? "…" : ` · ${percent}%`}
              </p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className={styles.error}>
              {zh
                ? "下载未完成，请重试或选择其他模型。"
                : "Download failed. Retry or choose another model."}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Dialog.Close asChild>
              <button type="button" className={styles.cancel}>
                {zh
                  ? busy
                    ? "取消"
                    : "暂不下载"
                  : busy
                    ? "Cancel"
                    : "Not now"}
              </button>
            </Dialog.Close>
            {!busy ? (
              <button
                type="button"
                className={styles.confirm}
                onClick={(event) => {
                  if (canConfirm(event)) browserModel.confirm();
                }}
              >
                <Download size={14} aria-hidden="true" />
                {zh
                  ? error
                    ? "重试下载"
                    : "下载并启用"
                  : error
                    ? "Retry download"
                    : "Download and enable"}
              </button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
