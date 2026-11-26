// @vitest-environment jsdom
// Regression: the rooms list loops React (error #185) if many-week queries
// return fresh data on every render.
import { expect, it, vi } from 'vitest';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { setTransport } from '@/lib/lectio/client';

vi.mock('@/lib/lectio/query', () => ({ useSchoolId: () => '123' }));
const { default: RoomsPage } = await import('@/features/rooms/RoomsPage');

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const base = 'https://www.lectio.dk/lectio/123/';
const schedule = readFileSync('fixtures/beaab8c9c5f46708.html', 'utf8');

it('renders rooms with lessons without an update loop', async () => {
  setTransport({
    async request(url) {
      if (!/findskema/i.test(url)) return { url, status: 200, html: schedule };
      const links = ['A12', 'B02', 'C11'].map((n, i) => `<li><a href="${base}SkemaNy.aspx?type=lokale&amp;nosubnav=1&amp;id=${700001 + i}">${n}</a></li>`).join('');
      return { url, status: 200, html: `<html><body><a href="logout.aspx">Log ud</a><div id="m_Content_listecontainer"><ul>${links}</ul></div></body></html>` };
    },
  });
  const errors: unknown[] = [];
  const el = document.body.appendChild(document.createElement('div'));
  const client = new QueryClient();
  await act(async () => {
    createRoot(el, { onUncaughtError: (e) => errors.push(e) }).render(
      h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: ['/rooms'] }, h(RoomsPage))),
    );
  });
  for (let i = 0; i < 10; i++) await act(() => new Promise((r) => setTimeout(r, 20)));
  expect(errors).toEqual([]);
  expect(el.textContent).toContain('A12');
});
