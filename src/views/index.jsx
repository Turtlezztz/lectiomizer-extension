// Rebuilt pages: a reader turns Lectio's page into data and a React view
// renders it. Lectio's original content stays in the form, hidden, so its
// postbacks and hidden fields keep working. If a reader fails, the page is left
// as Lectio rendered it.
import React, { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft } from 'lucide-react';
import { readGrades } from '../readers/grades.js';
import { GradesView } from './GradesView.jsx';

const views = {
  grades: { read: readGrades, View: GradesView },
};

let mounted = null;

function ViewFrame({ content, View, data }) {
  const [original, setOriginal] = useState(false);
  useLayoutEffect(() => {
    content.classList.toggle('lx-view-active', !original);
    return () => content.classList.remove('lx-view-active');
  }, [content, original]);
  if (original) return <div className="lx-view-bar"><span>Du ser Lectios oprindelige side.</span><button type="button" onClick={() => setOriginal(false)}><ArrowLeft size={16} aria-hidden="true" /> Tilbage til Lectiomizer</button></div>;
  return <View data={data} showOriginal={() => { setOriginal(true); content.ownerDocument.defaultView.scrollTo(0, 0); }} />;
}

// Returns true when the view rendered. Safe to call again after Lectio updates
// the page; the view re-reads the data and React applies only the changes.
export function mountView(content, kind) {
  const view = views[kind];
  if (!view) return false;
  let data;
  try {
    data = view.read(content.ownerDocument);
  } catch (error) {
    console.warn(`Lectiomizer: viser Lectios egen side, fordi ${kind} ikke kunne læses:`, error);
    unmountView();
    return false;
  }
  if (mounted && (mounted.content !== content || mounted.kind !== kind || !mounted.host.isConnected)) unmountView();
  if (!mounted) {
    const host = content.ownerDocument.createElement('div');
    host.className = 'lx-view';
    host.dataset.lxView = kind;
    content.prepend(host);
    mounted = { content, kind, host, root: createRoot(host) };
  }
  mounted.root.render(<ViewFrame content={content} View={view.View} data={data} />);
  return true;
}

export function unmountView() {
  if (!mounted) return;
  const { root, host, content } = mounted;
  mounted = null;
  root.unmount();
  host.remove();
  content.classList.remove('lx-view-active');
}
