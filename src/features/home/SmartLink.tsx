import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { appRoute } from '@/lib/lectio/paths';

/** In-app route when we have a page for the Lectio href, else the original Lectio page in a new tab. */
export function SmartLink({ href, className, children, title }: { href: string | null | undefined; className?: string; children: ReactNode; title?: string }) {
  const route = appRoute(href);
  if (route) return <Link to={route} className={className} title={title}>{children}</Link>;
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={className} title={title}>{children}</a>;
  return <div className={className} title={title}>{children}</div>;
}
