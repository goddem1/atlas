import { useCallback, useEffect, useState, type FormEvent } from "react";
import { addChannel, listChannels, login, readToken, removeChannel, writeToken, type ChannelRow } from "./api";
import { ServiceApp } from "./ServiceApp";

const DISCLAIMER = "Аналитика чужих мнений. Не инвестиционная рекомендация";

export function App() {
  const [token, setToken] = useState(readToken);
  const logout = useCallback(() => {
    writeToken("");
    setToken("");
  }, []);
  if (!token) return <Login onToken={setToken} />;
  if (window.location.pathname.startsWith("/service")) return <ServiceApp onLogout={logout} />;
  return <Channels onLogout={logout} />;
}

function Login({ onToken }: { onToken: (token: string) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await login(username, password);
      writeToken(result.token);
      onToken(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-xs uppercase tracking-[0.2em] text-indigo-400">scrtnews.panoramaapp.ru</p>
      <h1 className="mt-3 text-3xl font-semibold">PRVTNEWS</h1>
      <p className="mt-2 text-sm text-slate-400">{DISCLAIMER}</p>
      <form onSubmit={submit} className="mt-8 space-y-3 rounded-2xl border border-line bg-panel p-5">
        <input className="w-full rounded-xl border border-line bg-ink px-3 py-2" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        <input className="w-full rounded-xl border border-line bg-ink px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Пароль" />
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <button className="w-full rounded-xl bg-indigo-500 py-2 font-medium text-white disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Вход…" : "Войти"}
        </button>
      </form>
    </main>
  );
}

function Channels({ onLogout }: { onLogout: () => void }) {
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [username, setUsername] = useState("");
  const [kind, setKind] = useState<"opinion" | "news">("opinion");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function reload() {
    const next = await listChannels();
    setRows(next);
  }

  useEffect(() => {
    void reload().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Не удалось загрузить каналы";
      if (message === "Нужен вход") onLogout();
      else setError(message);
    });
  }, [onLogout]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await addChannel(username, kind);
      setUsername("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить канал");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await removeChannel(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить канал");
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-400">закрытый доступ</p>
          <h1 className="mt-2 text-3xl font-semibold">Каналы</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-400">{DISCLAIMER}</p>
        </div>
        <div className="flex gap-2">
          <a className="rounded-xl border border-line px-3 py-2 text-sm" href="/service">Сервис</a>
          <button className="rounded-xl border border-line px-3 py-2 text-sm" type="button" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </header>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 sm:flex-row">
        <input
          className="min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 py-2"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="@channel или t.me/channel"
        />
        <select className="rounded-xl border border-line bg-ink px-3 py-2" value={kind} onChange={(e) => setKind(e.target.value === "news" ? "news" : "opinion")}>
          <option value="opinion">мнение</option>
          <option value="news">новости</option>
        </select>
        <button className="rounded-xl bg-indigo-500 px-4 py-2 font-medium text-white disabled:opacity-60" disabled={pending} type="submit">
          Добавить
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

      <ul className="mt-6 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-panel px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{row.title || `@${row.username}`}</p>
              <p className="mt-1 text-sm text-slate-400">
                @{row.username} · {row.kind === "news" ? "новости" : "мнение"} · сообщений {row.messageCount}
                {row.lastSyncAt ? ` · сбор ${new Date(row.lastSyncAt).toLocaleString("ru-RU")}` : " · ждёт сбор"}
              </p>
              {row.lastError ? <p className="mt-1 text-sm text-amber-200">{row.lastError}</p> : null}
            </div>
            <button className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm" type="button" onClick={() => void remove(row.id)}>
              Удалить
            </button>
          </li>
        ))}
        {rows.length === 0 ? <li className="text-sm text-slate-400">Каналов пока нет. Добавьте три публичных username и запустите сбор.</li> : null}
      </ul>
    </main>
  );
}
