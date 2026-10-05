// Markdown → plain block structure for the chat's renderer (markdown.jsx).
// Kept free of React so it can be tested directly.

// Block structure: [{ type, ... }].
export function parseBlocks(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  const isTableRow = line => /^\s*\|.*\|\s*$/.test(line);
  const isRule = line => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
  const listItem = line => line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
  const splitRow = line => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.replace(/\\\|/g, '|').trim());
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^\s*(```|~~~)(.*)$/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ type: 'rule' }); i++; continue; }
    if (isTableRow(line) && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', blocks: parseBlocks(body.join('\n')) });
      continue;
    }
    const item = listItem(line);
    if (item) {
      const ordered = /\d/.test(item[2]);
      const indent = item[1].length;
      const items = [];
      while (i < lines.length) {
        const current = listItem(lines[i]);
        if (current && current[1].length <= indent + 1 && /\d/.test(current[2]) === ordered) {
          items.push([current[3]]);
          i++;
        } else if (lines[i].trim() && items.length && (/^\s{2,}/.test(lines[i]) || (current && current[1].length > indent))) {
          items.at(-1).push(lines[i].slice(Math.min(indent + 2, lines[i].search(/\S/))));
          i++;
        } else if (!lines[i].trim() && listItem(lines[i + 1] || '') && listItem(lines[i + 1])[1].length >= indent) {
          i++;
        } else break;
      }
      blocks.push({ type: 'list', ordered, start: ordered ? parseInt(item[2], 10) : 1, items: items.map(body => parseBlocks(body.join('\n'))) });
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|```|~~~|>)/.test(lines[i]) && !listItem(lines[i]) && !(isTableRow(lines[i]) && isRule(lines[i + 1] || ''))) paragraph.push(lines[i++].trim());
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }
  return blocks;
}

// Inline syntax: code, links, images (never loaded), bold, strikethrough,
// italics and bare URLs. Groups: 2 code, 3 label, 4 href, 5/6 bold, 7 strike,
// 8/9 italics, 10 bare URL.
export const INLINE = /(`+)([^`]+?)\1|\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|!\[[^\]\n]*\]\([^)\n]*\)|\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|~~([^~\n]+?)~~|(?<![\w*])\*([^*\n]+?)\*(?!\w)|(?<![\w_])_([^_\n]+?)_(?!\w)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
