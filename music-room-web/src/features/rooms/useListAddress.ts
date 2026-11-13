import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const SEARCH_DELAY_MS = 400; // the search starts once the typing stops for this long

// Where a list page is (its chip, its search, its page) lives in the address: Back from an item comes back to the same
// list, and a list can be bookmarked. The first chip is the default one.
export function useListAddress<F extends string>(chips: readonly F[]) {
  const [params, setParams] = useSearchParams();
  const filter = chips.find(chip => chip === params.get('filter')) ?? chips[0];
  const typed = params.get('q') ?? '';
  const page = Math.max(Math.floor(Number(params.get('page'))) || 1, 1);
  const [text, setText] = useState(typed); // the search box, ahead of the address while typing

  // Changes the address. Typing replaces the current entry, so Back does not go through every word typed.
  function go(change: { filter?: F; q?: string; page?: number }) {
    const next = new URLSearchParams(params);
    const set = (key: string, value: string | undefined, fallback: string) => {
      if (value === undefined) return;
      if (value === fallback) next.delete(key);
      else next.set(key, value);
    };
    set('filter', change.filter, chips[0]);
    set('q', change.q, '');
    set('page', change.page === undefined ? undefined : String(change.page), '1');
    setParams(next, { replace: change.q !== undefined });
  }

  // Back or a bookmark gives the search box its text; typing reaches the address once it stops. A chip clicked
  // meanwhile changes the address: the wait starts again from it, so the search keeps that chip.
  useEffect(() => { setText(typed); }, [typed]);
  useEffect(() => {
    if (text === typed) return;
    const timer = setTimeout(() => go({ q: text, page: 1 }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, params]);

  return { filter, query: typed.trim(), page, text, setText, go };
}
