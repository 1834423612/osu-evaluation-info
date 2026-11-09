"use client";

import {
  browserTranslationAvailability,
  downloadBrowserTranslationModel,
} from "@/lib/translation/browser";
import type {
  BrowserTranslationAvailability,
  ModelDownloadProgress,
} from "@/lib/translation/browser";
import type { TranslationTarget } from "@/lib/translation/service";
import type { Locale } from "@/lib/i18n";

type Availability = BrowserTranslationAvailability | "checking";
type Pair = { sourceLanguage: "en" | "zh"; targetLanguage: TranslationTarget };
type Download = Pair & {
  locale: Locale;
  container: HTMLElement | null;
  stage: "confirm" | "downloading" | "error";
  progress: ModelDownloadProgress;
};
const states = new Map<string, Availability>();
const checks = new Map<string, Promise<void>>();
const revisions = new Map<string, number>();
const listeners = new Set<() => void>();
let download: Download | null = null;
let pending: {
  promise: Promise<boolean>;
  resolve: (ready: boolean) => void;
} | null = null;
let controller: AbortController | null = null;
const key = (pair: Pair) => `${pair.sourceLanguage}:${pair.targetLanguage}`;
const emit = () => listeners.forEach((listener) => listener());
const emptyProgress: ModelDownloadProgress = {
  fraction: null,
  totalBytes: null,
  loadedBytes: null,
};

export const browserModel = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  availability: (pair: Pair): Availability =>
    states.get(key(pair)) ?? "checking",
  async check(pair: Pair, refresh = false) {
    if (checks.has(key(pair))) return checks.get(key(pair));
    if (!refresh && states.has(key(pair))) return;
    const revision = revisions.get(key(pair));
    const request = browserTranslationAvailability(
      pair.sourceLanguage,
      pair.targetLanguage,
    )
      .then((state) => {
        if (
          revisions.get(key(pair)) === revision &&
          (!download || key(download) !== key(pair))
        )
          states.set(key(pair), state);
        emit();
      })
      .finally(() => {
        checks.delete(key(pair));
      });
    checks.set(key(pair), request);
    return request;
  },
  getDownload: () => download,
  getServerDownload: () => null,
  request(pair: Pair, locale: Locale, container: HTMLElement | null) {
    if (pending)
      return download && key(download) === key(pair)
        ? pending.promise
        : Promise.resolve(false);
    const state = states.get(key(pair));
    if (state === "available") return Promise.resolve(true);
    if (state !== "downloadable" && state !== "downloading")
      return Promise.resolve(false);
    let resolve!: (ready: boolean) => void;
    const promise = new Promise<boolean>((done) => {
      resolve = done;
    });
    pending = { promise, resolve };
    download = {
      ...pair,
      locale,
      container,
      stage: "confirm",
      progress: emptyProgress,
    };
    emit();
    return promise;
  },
  confirm() {
    if (!download || download.stage === "downloading") return;
    const selected = download;
    revisions.set(key(selected), (revisions.get(key(selected)) ?? 0) + 1);
    const active = new AbortController();
    controller = active;
    download = { ...selected, stage: "downloading", progress: emptyProgress };
    // create() runs synchronously in this click handler, before awaiting anything.
    const request = downloadBrowserTranslationModel(
      selected.sourceLanguage,
      selected.targetLanguage,
      (progress) => {
        if (controller !== active || !download) return;
        download = { ...download, progress };
        emit();
      },
      active.signal,
    );
    emit();
    void request.then(
      () => {
        if (controller !== active) return;
        states.set(key(selected), "available");
        const resolve = pending?.resolve;
        pending = null;
        download = null;
        controller = null;
        emit();
        resolve?.(true);
      },
      () => {
        if (controller !== active || !download) return;
        controller = null;
        download = { ...download, stage: "error" };
        emit();
      },
    );
  },
  cancel() {
    const active = controller;
    const resolve = pending?.resolve;
    controller = null;
    pending = null;
    download = null;
    active?.abort();
    emit();
    resolve?.(false);
  },
};
