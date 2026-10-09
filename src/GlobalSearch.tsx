import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api, type GraphItem } from './types';

export type SearchHit = GraphItem & {
  accounts: { id: string; name: string }[];
  matched_field: string;
  snippet: string;
};
export default function GlobalSearch({
  onSelect,
}: {
  onSelect: (hit: SearchHit, account: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const [offset, setOffset] = useState(0);
  const [accountChoice, setAccountChoice] = useState<SearchHit | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setItems([]);
        setTotal(0);
        setBusy(false);
        return;
      }
      setBusy(true);
      setError('');
      try {
        const result = await api<{ items: SearchHit[]; total: number }>(
          `/graph/search?q=${encodeURIComponent(query)}&offset=${offset}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setItems(result.items);
        setTotal(result.total);
        setActive(0);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, offset]);
  function choose(hit: SearchHit, account?: string) {
    if (!account && hit.accounts.length > 1) {
      setAccountChoice(hit);
      return;
    }
    onSelect(hit, account || hit.accounts[0]?.id || '');
    setQuery('');
    setItems([]);
    setAccountChoice(null);
    setOffset(0);
  }
  return (
    <div
      className="search global-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setQuery('');
          setAccountChoice(null);
        }
      }}
    >
      <Search size={15} />
      <input
        aria-label="Cari semua node"
        maxLength={300}
        placeholder="Cari node, email, pesan, tiket…"
        value={query}
        role="combobox"
        aria-expanded={!!query.trim()}
        aria-controls="node-search-results"
        aria-autocomplete="list"
        aria-activedescendant={items[active] ? `search-hit-${active}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setItems([]);
          setAccountChoice(null);
          setOffset(0);
          setBusy(!!e.target.value.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setQuery('');
            setAccountChoice(null);
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(items.length - 1, i + 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          }
          if (e.key === 'Enter' && items[active]) {
            e.preventDefault();
            choose(items[active]);
          }
        }}
      />
      {!!query.trim() && (
        <div className="search-results global-results">
          {busy ? (
            <p role="status">Mencari seluruh node…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : (
            <>
              {accountChoice ? (
                <div className="search-account-choice">
                  <strong>Pilih konteks akun untuk {accountChoice.id}</strong>
                  {accountChoice.accounts.map((account) => (
                    <button key={account.id} onClick={() => choose(accountChoice, account.id)}>
                      {account.id} · {account.name}
                    </button>
                  ))}
                  <button onClick={() => setAccountChoice(null)}>Kembali ke hasil</button>
                </div>
              ) : (
                <>
                  <div id="node-search-results" role="listbox" aria-label="Hasil pencarian node">
                    {items.map((hit, i) => (
                      <button
                        id={`search-hit-${i}`}
                        role="option"
                        aria-selected={active === i}
                        key={hit.id}
                        onClick={() => choose(hit)}
                      >
                        <strong>
                          {hit.id} · {hit.label}
                        </strong>
                        <small>
                          {hit.kind} · {hit.matched_field}
                        </small>
                        <span>{hit.snippet}</span>
                      </button>
                    ))}
                  </div>
                  {!items.length && <p>Node tidak ditemukan</p>}
                  {!!items.length && (
                    <div className="search-paging">
                      <span>
                        {offset + 1}–{Math.min(offset + items.length, total)} dari {total}
                      </span>
                      <button
                        disabled={!offset}
                        onClick={() => setOffset((v) => Math.max(0, v - 20))}
                      >
                        Sebelumnya
                      </button>
                      <button
                        disabled={offset + items.length >= total}
                        onClick={() => setOffset((v) => v + 20)}
                      >
                        Berikutnya
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
