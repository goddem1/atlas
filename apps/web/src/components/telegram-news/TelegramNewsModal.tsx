import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  TelegramNewsChannel,
  TelegramNewsMessage,
  TelegramNewsTextEntity,
} from "@atlas-v1/shared";
import { TELEGRAM_CHANNELS_MAX, normalizeTelegramUsername } from "@atlas-v1/shared";
import { useBackdropBlurPause } from "../../lib/useBackdropBlurPause";
import { TwemojiText } from "../../lib/twemojiText";
import {
  loadTelegramChannels,
  normalizeChannelList,
  saveTelegramChannels,
} from "../../lib/telegramChannels";
import {
  isTelegramNewsChannelUnread,
  loadTelegramNewsReadState,
  markTelegramNewsChannelRead,
  type TelegramNewsReadMap,
} from "../../lib/telegramNewsReadState";
import {
  applyTelegramFilters,
  hiddenByTelegramFilters,
  loadTelegramFilters,
  matchedFilterWords,
  saveTelegramFilters,
} from "../../lib/telegramFilters";
import {
  fetchTelegramNewsChannels,
  fetchTelegramNewsFeed,
  fetchTelegramNewsMessages,
  telegramNewsChannelPhotoUrl,
  telegramNewsMessageMediaUrl,
  telegramNewsMessageVideoThumbUrl,
  telegramNewsMessageVideoUrl,
} from "../../services/api";
import { TelegramNewsFiltersPanel } from "./TelegramNewsFiltersPanel";
import { TelegramNewsAddChannelPanel } from "./TelegramNewsAddChannelPanel";
import "./telegram-news-modal.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Виртуальный «чат» — общая лента по всем подпискам. */
const ALL_FEED_ID = "__all__";

function messageKey(msg: TelegramNewsMessage): string {
  return `${msg.channelUsername}:${msg.id}`;
}

/** Хронологически: старые сверху, новые снизу (как в чате). */
function sortMessagesChronological(rows: TelegramNewsMessage[]): TelegramNewsMessage[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.date) || 0;
    const tb = Date.parse(b.date) || 0;
    if (ta !== tb) return ta - tb;
    if (a.channelUsername !== b.channelUsername) {
      return a.channelUsername < b.channelUsername ? -1 : 1;
    }
    return a.id - b.id;
  });
}

function messagesLikelyUnchanged(
  prev: TelegramNewsMessage[],
  next: TelegramNewsMessage[],
): boolean {
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;
  return (
    messageKey(prev[0]!) === messageKey(next[0]!) &&
    messageKey(prev[prev.length - 1]!) === messageKey(next[next.length - 1]!)
  );
}

function scrollFeedToBottom(feed: HTMLElement) {
  feed.scrollTop = feed.scrollHeight;
}

function isFeedNearBottom(feed: HTMLElement, thresholdPx = 96): boolean {
  return feed.scrollHeight - feed.scrollTop - feed.clientHeight < thresholdPx;
}

/** Telegram-like: тонкий скроллбар только при реальном overflow и во время скролла/hover. */
function bindTelegramScrollbar(el: HTMLElement): () => void {
  let hideTimer = 0;

  const syncScrollable = () => {
    const canScroll = el.scrollHeight > el.clientHeight + 1;
    el.classList.toggle("is-scrollable", canScroll);
    if (!canScroll) el.classList.remove("is-scrollbar-visible");
  };

  const showScrollbar = () => {
    syncScrollable();
    if (!el.classList.contains("is-scrollable")) return;
    el.classList.add("is-scrollbar-visible");
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      el.classList.remove("is-scrollbar-visible");
    }, 2500);
  };

  const onScroll = () => showScrollbar();
  const onEnter = () => showScrollbar();
  const onLeave = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      el.classList.remove("is-scrollbar-visible");
    }, 1200);
  };

  syncScrollable();
  const ro = new ResizeObserver(syncScrollable);
  ro.observe(el);
  const mo = new MutationObserver(syncScrollable);
  mo.observe(el, { childList: true, subtree: true, characterData: true });
  el.addEventListener("scroll", onScroll, { passive: true });
  el.addEventListener("pointerenter", onEnter);
  el.addEventListener("pointerleave", onLeave);

  return () => {
    window.clearTimeout(hideTimer);
    ro.disconnect();
    mo.disconnect();
    el.removeEventListener("scroll", onScroll);
    el.removeEventListener("pointerenter", onEnter);
    el.removeEventListener("pointerleave", onLeave);
    el.classList.remove("is-scrollable", "is-scrollbar-visible");
  };
}

function formatMessageTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  // Как в Telegram: за последние сутки показываем время, а не вчерашнюю дату.
  if (diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(
    "ru-RU",
    sameYear
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" },
  );
}

function formatViews(views: number | null): string {
  if (views == null || !Number.isFinite(views)) return "";
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return String(views);
}

const PEER_NAME_COLOR_COUNT = 8;

function peerNameColorIndex(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i += 1) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  }
  return hash % PEER_NAME_COLOR_COUNT;
}

function hrefForEntity(slice: string, entity: TelegramNewsTextEntity): string | null {
  if (entity.type === "text_url" && entity.url) return entity.url;
  if (entity.type === "url") {
    const raw = slice.trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^tg:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }
  if (entity.type === "mention") {
    const name = slice.replace(/^@/, "").trim();
    return name ? `https://t.me/${name}` : null;
  }
  return null;
}

function renderPlainWithFallbackLinks(text: string, keyPrefix: string) {
  const parts = text.split(/(https?:\/\/[^\s<>]+|t\.me\/[^\s<>]+|www\.[^\s<>]+|#[\p{L}\p{N}_]+)/gu);
  return parts.map((part, index) => {
    if (!part) return null;
    if (/^#[\p{L}\p{N}_]+$/u.test(part)) {
      return (
        <span key={`${keyPrefix}-h-${index}`} className="tg-news-hashtag">
          {part}
        </span>
      );
    }
    if (/^(https?:\/\/|t\.me\/|www\.)/i.test(part)) {
      const href = /^https?:\/\//i.test(part)
        ? part
        : part.toLowerCase().startsWith("t.me/")
          ? `https://${part}`
          : `https://${part}`;
      return (
        <a
          key={`${keyPrefix}-l-${index}`}
          className="tg-news-inline-link"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          {part}
        </a>
      );
    }
    return <TwemojiText key={`${keyPrefix}-t-${index}`} text={part} />;
  });
}

function renderMessageText(text: string, entities: TelegramNewsTextEntity[] = []) {
  if (!text) return null;
  if (!entities.length) return renderPlainWithFallbackLinks(text, "f");

  const sorted = [...entities]
    .filter((e) => e.length > 0 && e.offset >= 0)
    .sort((a, b) => a.offset - b.offset || b.length - a.length);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const entity of sorted) {
    if (entity.offset < cursor) continue;
    if (entity.offset > cursor) {
      nodes.push(
        ...renderPlainWithFallbackLinks(text.substring(cursor, entity.offset), `p${key++}`),
      );
    }
    const end = Math.min(text.length, entity.offset + entity.length);
    const slice = text.substring(entity.offset, end);
    if (entity.type === "hashtag") {
      nodes.push(
        <span key={`e${key++}`} className="tg-news-hashtag">
          {slice}
        </span>,
      );
    } else {
      const href = hrefForEntity(slice, entity);
      if (href) {
        nodes.push(
          <a
            key={`e${key++}`}
            className="tg-news-inline-link"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {slice}
          </a>,
        );
      } else {
        nodes.push(<TwemojiText key={`e${key++}`} text={slice} />);
      }
    }
    cursor = end;
  }

  if (cursor < text.length) {
    nodes.push(...renderPlainWithFallbackLinks(text.substring(cursor), `t${key++}`));
  }

  return nodes;
}

function ViewsIcon() {
  return (
    <svg className="tg-news-views-icon" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M12 5c-5.5 0-9.5 5.1-9.9 5.6a.8.8 0 0 0 0 .8C2.5 11.9 6.5 17 12 17s9.5-5.1 9.9-5.6a.8.8 0 0 0 0-.8C21.5 10.1 17.5 5 12 5Zm0 10.2A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4Zm0-5.2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"
      />
    </svg>
  );
}

function ChannelAvatar({ channel, unread }: { channel: TelegramNewsChannel; unread?: boolean }) {
  const [failed, setFailed] = useState(false);
  const letter = (channel.title || channel.username).slice(0, 1).toUpperCase();
  const avatar =
    !channel.hasPhoto || failed ? (
      <span className="tg-news-avatar tg-news-avatar--fallback" aria-hidden>
        {letter}
      </span>
    ) : (
      <img
        className="tg-news-avatar"
        src={telegramNewsChannelPhotoUrl(channel.username)}
        alt=""
        onError={() => setFailed(true)}
      />
    );

  return (
    <span className="tg-news-avatar-wrap">
      {avatar}
      {unread ? <span className="tg-news-unread-dot" aria-hidden /> : null}
    </span>
  );
}

function MessageImage({ username, messageId }: { username: string; messageId: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <a
      className="tg-news-bubble-image-link"
      href={telegramNewsMessageMediaUrl(username, messageId)}
      target="_blank"
      rel="noreferrer"
    >
      <img
        className="tg-news-bubble-image"
        src={telegramNewsMessageMediaUrl(username, messageId)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

const VIDEO_MAX_BYTES = 40 * 1024 * 1024;

function formatVideoSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

function MessageVideo({
  username,
  messageId,
  videoSize,
  hasVideoThumb,
  postUrl,
}: {
  username: string;
  messageId: number;
  videoSize: number | null;
  hasVideoThumb: boolean;
  postUrl: string;
}) {
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const tooLarge = videoSize != null && videoSize > VIDEO_MAX_BYTES;
  const thumbUrl =
    hasVideoThumb && !thumbFailed
      ? telegramNewsMessageVideoThumbUrl(username, messageId)
      : null;

  if (tooLarge || failed) {
    return (
      <a className="tg-news-bubble-video-fallback" href={postUrl} target="_blank" rel="noreferrer">
        {thumbUrl ? (
          <img
            className="tg-news-bubble-video-poster"
            src={thumbUrl}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        ) : null}
        <span className="tg-news-bubble-video-fallback-label">
          Смотреть видео в Telegram
          {tooLarge && videoSize != null ? ` (${formatVideoSize(videoSize)})` : ""}
        </span>
      </a>
    );
  }

  if (!started) {
    return (
      <button
        type="button"
        className={`tg-news-bubble-video-start${thumbUrl ? " has-poster" : ""}`}
        onClick={() => setStarted(true)}
      >
        {thumbUrl ? (
          <img
            className="tg-news-bubble-video-poster"
            src={thumbUrl}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        ) : null}
        <span className="tg-news-bubble-video-play" aria-hidden>
          ▶
        </span>
        <span className="tg-news-bubble-video-start-label">
          Смотреть видео
          {videoSize != null ? ` · ${formatVideoSize(videoSize)}` : ""}
        </span>
      </button>
    );
  }

  return (
    <video
      className="tg-news-bubble-video"
      controls
      playsInline
      preload="metadata"
      poster={thumbUrl ?? undefined}
      src={telegramNewsMessageVideoUrl(username, messageId)}
      onError={() => setFailed(true)}
    />
  );
}

export function TelegramNewsModal({ open, onClose }: Props) {
  useBackdropBlurPause(open);
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"channels" | "posts">("channels");
  const [subscribedUsernames, setSubscribedUsernames] = useState<string[]>([]);
  const [channels, setChannels] = useState<TelegramNewsChannel[]>([]);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [activeUsername, setActiveUsername] = useState<string | null>(null);
  const [messages, setMessages] = useState<TelegramNewsMessage[]>([]);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<string[]>([]);
  const [readState, setReadState] = useState<TelegramNewsReadMap>({});
  const [showHiddenByFilters, setShowHiddenByFilters] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const channelListRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<TelegramNewsMessage[]>([]);
  messagesRef.current = messages;

  const reloadChannels = useCallback(async (usernames: string[] | undefined, cancelled: () => boolean) => {
    setChannelsLoading(true);
    setChannelsError(null);
    try {
      const rows = await fetchTelegramNewsChannels(usernames);
      if (cancelled()) return;
      setChannels(rows);
      if (usernames === undefined) {
        const defaults = rows.map((r) => r.username);
        saveTelegramChannels(defaults);
        setSubscribedUsernames(defaults);
      }
      setActiveUsername((prev) => {
        if (prev === ALL_FEED_ID) return rows.length > 0 ? ALL_FEED_ID : null;
        if (prev && rows.some((r) => r.username === prev)) return prev;
        return rows.length > 0 ? ALL_FEED_ID : null;
      });
    } catch (err: unknown) {
      if (cancelled()) return;
      setChannelsError(err instanceof Error ? err.message : "Не удалось загрузить каналы");
    } finally {
      if (!cancelled()) setChannelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (addOpen) {
          setAddOpen(false);
          setAddError(null);
          return;
        }
        if (filtersOpen) {
          setFiltersOpen(false);
          return;
        }
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, addOpen, filtersOpen]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSearchMode("channels");
      setChannels([]);
      setChannelsError(null);
      setActiveUsername(null);
      setMessages([]);
      setMessagesError(null);
      setAddOpen(false);
      setAddInput("");
      setAddError(null);
      setFiltersOpen(false);
      setShowHiddenByFilters(false);
      return;
    }

    setFilters(loadTelegramFilters());
    setReadState(loadTelegramNewsReadState());

    let cancelled = false;
    const stored = loadTelegramChannels();
    if (stored && stored.length > 0) {
      setSubscribedUsernames(stored);
      void reloadChannels(stored, () => cancelled);
    } else {
      setSubscribedUsernames([]);
      void reloadChannels(undefined, () => cancelled);
    }

    return () => {
      cancelled = true;
    };
  }, [open, reloadChannels]);

  useEffect(() => {
    if (!open || !activeUsername) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    setMessagesError(null);

    const feedLimit = filters.length > 0 ? 100 : 60;
    const channelLimit = filters.length > 0 ? 80 : 50;
    const load =
      activeUsername === ALL_FEED_ID
        ? fetchTelegramNewsFeed(subscribedUsernames, { limit: feedLimit })
        : fetchTelegramNewsMessages(activeUsername, { limit: channelLimit });

    void load
      .then((rows) => {
        if (cancelled) return;
        setMessages(sortMessagesChronological(rows));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMessages([]);
        setMessagesError(err instanceof Error ? err.message : "Не удалось загрузить сообщения");
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeUsername, subscribedUsernames, filters.length]);

  // Live UI: пока модалка открыта, тихо читаем БД (сервер уже пишет посты через MTProto).
  useEffect(() => {
    if (!open || !activeUsername) return;
    const selection = activeUsername;
    const feedLimit = filters.length > 0 ? 100 : 60;
    const channelLimit = filters.length > 0 ? 80 : 50;
    let cancelled = false;

    const pollMessages = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const rows =
          selection === ALL_FEED_ID
            ? await fetchTelegramNewsFeed(subscribedUsernames, { limit: feedLimit })
            : await fetchTelegramNewsMessages(selection, { limit: channelLimit });
        if (cancelled) return;
        const sorted = sortMessagesChronological(rows);
        const prev = messagesRef.current;
        if (messagesLikelyUnchanged(prev, sorted)) return;

        const feed = feedRef.current;
        const nearBottom = !feed || isFeedNearBottom(feed);
        setMessages(sorted);
        setMessagesError(null);

        // Сразу обновим превью канала в списке слева (для общей ленты — канал последнего поста).
        const latest = sorted[sorted.length - 1];
        if (latest) {
          const preview = latest.text.trim()
            ? latest.text.replace(/\s+/g, " ").trim().slice(0, 80)
            : latest.hasMedia
              ? "[медиа]"
              : null;
          setChannels((prevChannels) => {
            const next = prevChannels.map((ch) =>
              ch.username === latest.channelUsername
                ? {
                    ...ch,
                    lastMessagePreview: preview || ch.lastMessagePreview,
                    lastMessageAt: latest.date,
                  }
                : ch,
            );
            next.sort((a, b) => {
              const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
              const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
              return tb - ta;
            });
            return next;
          });
        }

        if (nearBottom && feed) {
          requestAnimationFrame(() => {
            scrollFeedToBottom(feed);
          });
        }
      } catch {
        // тихий poll — не сбиваем ленту ошибками сети
      }
    };

    const pollChannels = async () => {
      if (document.visibilityState === "hidden") return;
      const stored = loadTelegramChannels();
      const list = stored && stored.length > 0 ? stored : subscribedUsernames;
      if (list.length === 0) return;
      try {
        const rows = await fetchTelegramNewsChannels(list);
        if (!cancelled) setChannels(rows);
      } catch {
        // ignore
      }
    };

    // Сразу подтянем список каналов (превью слева).
    void pollChannels();

    const messagesTimer = window.setInterval(() => {
      void pollMessages();
    }, 8_000);
    const channelsTimer = window.setInterval(() => {
      void pollChannels();
    }, 8_000);

    return () => {
      cancelled = true;
      window.clearInterval(messagesTimer);
      window.clearInterval(channelsTimer);
    };
  }, [open, activeUsername, subscribedUsernames, filters.length]);

  useEffect(() => {
    if (!messagesLoading && feedRef.current) {
      scrollFeedToBottom(feedRef.current);
    }
  }, [messagesLoading, activeUsername, showHiddenByFilters]);

  useEffect(() => {
    if (!open) return;
    const feed = feedRef.current;
    if (!feed) return;
    return bindTelegramScrollbar(feed);
  }, [open, activeUsername]);

  useEffect(() => {
    if (!open) return;
    const list = channelListRef.current;
    if (!list) return;
    return bindTelegramScrollbar(list);
  }, [open]);

  useEffect(() => {
    if (!open || !activeUsername || activeUsername === ALL_FEED_ID) return;
    if (messagesLoading) return;

    let readAt: string | null = null;
    if (messages.length > 0) {
      let best = messages[0]!;
      for (const msg of messages) {
        const ts = Date.parse(msg.date) || 0;
        const bestTs = Date.parse(best.date) || 0;
        if (ts > bestTs) best = msg;
      }
      readAt = best.date;
    } else {
      readAt = channels.find((ch) => ch.username === activeUsername)?.lastMessageAt ?? null;
    }

    if (!readAt) return;
    setReadState(markTelegramNewsChannelRead(activeUsername, readAt));
  }, [open, activeUsername, messagesLoading, messages, channels]);

  const visibleMessages = useMemo(
    () => applyTelegramFilters(messages, filters),
    [messages, filters],
  );

  const hiddenMessages = useMemo(
    () => hiddenByTelegramFilters(messages, filters),
    [messages, filters],
  );

  useEffect(() => {
    setShowHiddenByFilters(false);
  }, [activeUsername]);

  useEffect(() => {
    if (hiddenMessages.length === 0) setShowHiddenByFilters(false);
  }, [hiddenMessages.length]);

  const feedMessages = showHiddenByFilters ? hiddenMessages : visibleMessages;

  const filteredChannels = useMemo(() => {
    if (searchMode !== "channels") return channels;
    const q = query.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter(
      (c) =>
        c.username.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (c.lastMessagePreview?.toLowerCase().includes(q) ?? false),
    );
  }, [channels, query, searchMode]);

  const showAllFeedRow = useMemo(() => {
    if (channels.length === 0) return false;
    if (searchMode !== "channels") return true;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return "общая лента".includes(q) || "лента".includes(q) || "все".includes(q);
  }, [channels.length, query, searchMode]);

  const titleByUsername = useMemo(() => {
    const map = new Map<string, string>();
    for (const ch of channels) map.set(ch.username, ch.title);
    return map;
  }, [channels]);

  const displayFeedMessages = useMemo(() => {
    if (searchMode !== "posts") return feedMessages;
    const q = query.trim().toLowerCase();
    if (!q) return feedMessages;
    return feedMessages.filter((msg) => {
      const author = titleByUsername.get(msg.channelUsername) ?? `@${msg.channelUsername}`;
      return (
        msg.text.toLowerCase().includes(q) ||
        msg.channelUsername.toLowerCase().includes(q) ||
        author.toLowerCase().includes(q)
      );
    });
  }, [feedMessages, query, searchMode, titleByUsername]);

  const allFeedMeta = useMemo(() => {
    let best: TelegramNewsChannel | null = null;
    for (const ch of channels) {
      if (!ch.lastMessageAt) continue;
      if (!best?.lastMessageAt || Date.parse(ch.lastMessageAt) > Date.parse(best.lastMessageAt)) {
        best = ch;
      }
    }
    if (!best) return { preview: "Все добавленные каналы", at: null as string | null };
    const preview = best.lastMessagePreview
      ? `${best.title}: ${best.lastMessagePreview}`
      : `Последнее из ${best.title}`;
    return { preview, at: best.lastMessageAt };
  }, [channels]);

  const isAllFeed = activeUsername === ALL_FEED_ID;
  const activeChannel = useMemo(
    () => (isAllFeed ? null : channels.find((c) => c.username === activeUsername) ?? null),
    [channels, activeUsername, isAllFeed],
  );
  const hasMainPane = isAllFeed || activeChannel != null;

  const persistAndReload = useCallback(
    async (next: string[]) => {
      const normalized = normalizeChannelList(next);
      saveTelegramChannels(normalized);
      setSubscribedUsernames(normalized);
      await reloadChannels(normalized, () => false);
    },
    [reloadChannels],
  );

  const handleAddChannel = useCallback(async () => {
    const username = normalizeTelegramUsername(addInput);
    if (!username) {
      setAddError("Введите @username канала");
      return;
    }
    if (subscribedUsernames.includes(username)) {
      setAddError("Этот канал уже добавлен");
      return;
    }
    if (subscribedUsernames.length >= TELEGRAM_CHANNELS_MAX) {
      setAddError(`Можно добавить не больше ${TELEGRAM_CHANNELS_MAX} каналов`);
      return;
    }

    setAddBusy(true);
    setAddError(null);
    try {
      const rows = await fetchTelegramNewsChannels([username]);
      const row = rows[0];
      if (!row || (row.lastMessagePreview?.startsWith("Ошибка:") ?? false)) {
        setAddError(row?.lastMessagePreview?.replace(/^Ошибка:\s*/, "") || "Канал не найден");
        return;
      }
      const next = [...subscribedUsernames, username];
      await persistAndReload(next);
      setActiveUsername(username);
      setAddOpen(false);
      setAddInput("");
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Не удалось добавить канал");
    } finally {
      setAddBusy(false);
    }
  }, [addInput, subscribedUsernames, persistAndReload]);

  const handleRemoveChannel = useCallback(
    (username: string) => {
      const next = subscribedUsernames.filter((u) => u !== username);
      void persistAndReload(next).then(() => {
        setActiveUsername((prev) => {
          if (prev === ALL_FEED_ID) return next.length > 0 ? ALL_FEED_ID : null;
          if (prev === username) return next.length > 0 ? ALL_FEED_ID : null;
          return prev;
        });
      });
    },
    [subscribedUsernames, persistAndReload],
  );

  const handleRemoveFilter = useCallback(
    (word: string) => {
      const next = filters.filter((f) => f.toLowerCase() !== word.toLowerCase());
      saveTelegramFilters(next);
      setFilters(next);
    },
    [filters],
  );

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="tg-news-overlay" role="presentation">
      <button type="button" className="tg-news-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tg-news-title"
        className="tg-news-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="tg-news-sidebar">
          <h2 id="tg-news-title" className="tg-news-sr-only">
            Новости Telegram
          </h2>

          <div className="tg-news-sidebar-top">
            <div className="tg-news-search">
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchMode === "posts" ? "Поиск постов" : "Поиск каналов"}
                className="tg-news-search-input"
                autoFocus
              />
            </div>
          </div>

          {!channelsLoading && !channelsError && channels.length > 0 && showAllFeedRow ? (
            <div className="tg-news-all-feed">
              <div className={`tg-news-channel-row${isAllFeed ? " is-active" : ""}`}>
                <button
                  type="button"
                  className="tg-news-channel-row-main"
                  onClick={() => setActiveUsername(ALL_FEED_ID)}
                >
                  <span className="tg-news-avatar tg-news-avatar--fallback tg-news-avatar--all" aria-hidden>
                    ∑
                  </span>
                  <span className="tg-news-channel-meta">
                    <span className="tg-news-channel-title">Общая лента</span>
                        <span className="tg-news-channel-preview">
                          <TwemojiText text={allFeedMeta.preview} />
                        </span>
                  </span>
                </button>
              </div>
            </div>
          ) : null}

          <div className="tg-news-channel-list-shell">
            <div className="tg-news-channel-list" ref={channelListRef}>
            {channelsLoading ? (
              <div className="tg-news-empty">Загрузка каналов…</div>
            ) : channelsError ? (
              <div className="tg-news-empty tg-news-empty--error">{channelsError}</div>
            ) : channels.length === 0 ? (
              <div className="tg-news-empty">
                {subscribedUsernames.length === 0
                  ? "Добавьте канал кнопкой ⚙"
                  : "Нет каналов"}
              </div>
            ) : filteredChannels.length === 0 ? (
              <div className="tg-news-empty">Нет каналов</div>
            ) : (
              filteredChannels.map((channel) => {
                const active = channel.username === activeUsername;
                const unread =
                  !active &&
                  isTelegramNewsChannelUnread(channel.username, channel.lastMessageAt, readState);
                return (
                  <div
                    key={channel.username}
                    className={`tg-news-channel-row${active ? " is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className="tg-news-channel-row-main"
                      onClick={() => setActiveUsername(channel.username)}
                    >
                      <ChannelAvatar channel={channel} unread={unread} />
                      <span className="tg-news-channel-meta">
                        <span className="tg-news-channel-title">{channel.title}</span>
                        <span className="tg-news-channel-preview">
                          <TwemojiText
                            text={channel.lastMessagePreview || `@${channel.username}`}
                          />
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="tg-news-channel-remove"
                      aria-label={`Удалить @${channel.username}`}
                      title="Удалить"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveChannel(channel.username);
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
            </div>
          </div>
        </aside>

        <section className="tg-news-main">
          {hasMainPane || addOpen ? (
            <>
              <header className="tg-news-main-header">
                <div className="tg-news-main-heading">
                  <div className="tg-news-main-title">
                    {addOpen && !hasMainPane
                      ? "Каналы"
                      : showHiddenByFilters
                        ? "Скрытые фильтрами"
                        : isAllFeed
                          ? "Общая лента"
                          : activeChannel?.title}
                  </div>
                </div>
                <div className="tg-news-main-actions">
                  <button
                    type="button"
                    className={`tg-news-icon-btn${searchMode === "posts" ? " is-on" : ""}`}
                    onClick={() => {
                      setSearchMode((mode) => {
                        const next = mode === "posts" ? "channels" : "posts";
                        if (next === "posts") {
                          requestAnimationFrame(() => searchInputRef.current?.focus());
                        }
                        return next;
                      });
                    }}
                    aria-label={searchMode === "posts" ? "Поиск постов включён" : "Включить поиск постов"}
                    aria-pressed={searchMode === "posts"}
                    title={searchMode === "posts" ? "Выключить поиск постов" : "Искать посты"}
                  >
                    <img src="/assets/portfolio-ui/search.svg" alt="" />
                  </button>
                  <button
                    type="button"
                    className={`tg-news-icon-btn${filtersOpen ? " is-on" : ""}`}
                    onClick={() => {
                      setFiltersOpen((v) => !v);
                      setAddOpen(false);
                      setAddError(null);
                    }}
                    aria-label="Фильтры"
                    title="Фильтры — скрыть посты со словами"
                  >
                    <img src="/assets/portfolio-ui/filter.svg" alt="" />
                    {filters.length > 0 ? (
                      <span className="tg-news-icon-badge">{filters.length}</span>
                    ) : null}
                  </button>
                  <span className="tg-news-main-actions-sep" aria-hidden />
                  <button
                    type="button"
                    className={`tg-news-icon-btn${addOpen ? " is-on" : ""}`}
                    onClick={() => {
                      setAddOpen((v) => !v);
                      setAddError(null);
                      setFiltersOpen(false);
                    }}
                    aria-label="Настройки каналов"
                    title="Добавить канал"
                  >
                    <img src="/assets/portfolio-ui/settings.svg" alt="" />
                  </button>
                  <button
                    type="button"
                    className="tg-news-icon-btn"
                    onClick={onClose}
                    aria-label="Закрыть"
                    title="Закрыть"
                  >
                    <img src="/assets/portfolio-ui/close.svg" alt="" />
                  </button>
                </div>
              </header>
              {filtersOpen && hasMainPane ? (
                <TelegramNewsFiltersPanel
                  filters={filters}
                  onFiltersChange={setFilters}
                  hiddenCount={hiddenMessages.length}
                  onShowHidden={() => setShowHiddenByFilters(true)}
                  onClose={() => setFiltersOpen(false)}
                />
              ) : null}
              {addOpen ? (
                <TelegramNewsAddChannelPanel
                  addInput={addInput}
                  addError={addError}
                  addBusy={addBusy}
                  onAddInputChange={(value) => {
                    setAddInput(value);
                    setAddError(null);
                  }}
                  onSubmit={() => void handleAddChannel()}
                  onClose={() => {
                    setAddOpen(false);
                    setAddError(null);
                  }}
                />
              ) : null}
              {hasMainPane ? (
              <div className="tg-news-feed-shell">
              <div className="tg-news-feed" ref={feedRef}>
                {messagesLoading && messages.length === 0 ? (
                  <div className="tg-news-empty">Загрузка сообщений…</div>
                ) : messagesError ? (
                  <div className="tg-news-empty tg-news-empty--error">{messagesError}</div>
                ) : messages.length === 0 ? (
                  <div className="tg-news-empty">Пока нет сообщений</div>
                ) : showHiddenByFilters && hiddenMessages.length === 0 ? (
                  <div className="tg-news-empty">Нет скрытых постов</div>
                ) : !showHiddenByFilters && visibleMessages.length === 0 ? (
                  <div className="tg-news-empty">
                    Все посты скрыты фильтрами
                    {hiddenMessages.length > 0 ? (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className="tg-news-inline-action"
                          onClick={() => setShowHiddenByFilters(true)}
                        >
                          показать {hiddenMessages.length}
                        </button>
                      </>
                    ) : filters.length > 0 ? (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className="tg-news-inline-action"
                          onClick={() => setFiltersOpen(true)}
                        >
                          изменить
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : displayFeedMessages.length === 0 ? (
                  <div className="tg-news-empty">Ничего не найдено</div>
                ) : (
                  <>
                    {showHiddenByFilters ? (
                      <div className="tg-news-hidden-banner">
                        Показаны только посты, попавшие под фильтры. Нажмите на чип слова, чтобы
                        убрать фильтр.
                      </div>
                    ) : null}
                    {displayFeedMessages.map((msg) => {
                    const authorTitle =
                      titleByUsername.get(msg.channelUsername) ?? `@${msg.channelUsername}`;
                    const matched = showHiddenByFilters
                      ? matchedFilterWords(msg, filters)
                      : [];
                    return (
                      <article
                        key={messageKey(msg)}
                        className={`tg-news-bubble${showHiddenByFilters ? " is-filtered" : ""}`}
                      >
                        <div className="tg-news-bubble-head">
                          <div
                            className="tg-news-bubble-author"
                            data-peer={peerNameColorIndex(msg.channelUsername)}
                          >
                            {authorTitle}
                          </div>
                          <div className="tg-news-bubble-meta">
                            {msg.views != null ? (
                              <span className="tg-news-bubble-views">
                                <ViewsIcon />
                                {formatViews(msg.views)}
                              </span>
                            ) : null}
                            <a
                              href={msg.url}
                              target="_blank"
                              rel="noreferrer"
                              className="tg-news-bubble-time"
                            >
                              {formatMessageTime(msg.date)}
                            </a>
                          </div>
                        </div>
                        {matched.length > 0 ? (
                          <div className="tg-news-bubble-matched">
                            {matched.map((word) => (
                              <button
                                key={word.toLowerCase()}
                                type="button"
                                className="tg-news-filter-chip tg-news-filter-chip--compact"
                                onClick={() => handleRemoveFilter(word)}
                                title={`Убрать фильтр «${word}»`}
                              >
                                <span>{word}</span>
                                <span className="tg-news-filter-chip-x" aria-hidden>
                                  ×
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {msg.hasImage ? (
                          <MessageImage username={msg.channelUsername} messageId={msg.id} />
                        ) : null}
                        {msg.hasVideo ? (
                          <MessageVideo
                            username={msg.channelUsername}
                            messageId={msg.id}
                            videoSize={msg.videoSize ?? null}
                            hasVideoThumb={Boolean(msg.hasVideoThumb)}
                            postUrl={msg.url}
                          />
                        ) : null}
                        {msg.text ? (
                          <p className="tg-news-bubble-text">
                            {renderMessageText(msg.text, msg.entities ?? [])}
                          </p>
                        ) : null}
                        {!msg.text && msg.hasMedia && !msg.hasImage && !msg.hasVideo ? (
                          <p className="tg-news-bubble-media">
                            [{msg.mediaType ?? "медиа"}]
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
                  </>
                )}
              </div>
              </div>
              ) : null}
            </>
          ) : (
            <div className="tg-news-empty tg-news-empty--center">
              {subscribedUsernames.length === 0 ? (
                <>
                  Добавьте канал
                  {" · "}
                  <button type="button" className="tg-news-inline-action" onClick={() => setAddOpen(true)}>
                    открыть форму
                  </button>
                </>
              ) : (
                "Выберите канал слева"
              )}
            </div>
          )}
        </section>
      </div>
    </div>,
    document.body,
  );
}
