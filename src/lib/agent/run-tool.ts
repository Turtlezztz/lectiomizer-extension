// Runs one Lectio tool for the MCP bridge in a context with a DOM (Firefox's
// background page, Chrome's offscreen document). Tool instances share fetched
// pages for a while, so a client's follow-up calls are quick.
import { getItem } from '../storage';
import { createLectioTools, type LectioTools, type ToolResult } from './tools';

let cached: { schoolId: string; at: number; tools: LectioTools } | null = null;

export async function runToolHere(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const settings = await getItem<{ school?: { id: string } | null }>('settings', {});
  const schoolId = settings.school?.id;
  if (!schoolId) return { ok: false, text: 'Fejl: Der er ikke valgt en skole i Lectiomizer endnu. Åbn Lectiomizer og vælg din skole.', label: 'Ingen skole' };
  if (!cached || cached.schoolId !== schoolId || Date.now() - cached.at > 5 * 60_000) cached = { schoolId, at: Date.now(), tools: createLectioTools({ schoolId, links: 'absolute' }) };
  return cached.tools.run(name, args && typeof args === 'object' ? args : {});
}
