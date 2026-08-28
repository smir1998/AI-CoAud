import type { ReactNode } from "react";

/* Compact markdown renderer tuned for the README studio preview. */

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(!\[[^\]\n]*\]\([^)\n]+\))|(\[[^\]\n]+\]\([^)\n]+\))/g;

function inline(text: string, base: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${base}-${i++}`;
    if (tok.startsWith("`")) {
      out.push(<code key={key} className="md-code">{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      out.push(<strong key={key} className="font-semibold text-ink-100">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("![")) {
      const alt = tok.slice(2, tok.indexOf("]"));
      const url = tok.slice(tok.indexOf("(") + 1, -1);
      out.push(
        <span key={key} title={url} className="md-badge">{alt || "badge"}</span>,
      );
    } else {
      const label = tok.slice(1, tok.indexOf("]"));
      const url = tok.slice(tok.indexOf("(") + 1, -1);
      out.push(
        <a key={key} href={url} target="_blank" rel="noreferrer" className="md-link">{label}</a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const HL = /(#[^\n]*|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(\d+(?:\.\d+)?)\b|\b(def|class|return|import|from|const|let|var|function|async|await|if|elif|else|for|while|in|of|export|type|interface|extends|new|try|except|catch|raise|throw|with|as|pass|lambda|yield|not|and|or|services|volumes|image|ports|build|environment|healthcheck|test|command|depends_on)\b/g;

function highlight(code: string, base: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  HL.lastIndex = 0;
  while ((m = HL.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const key = `${base}-${i++}`;
    if (m[1]) out.push(<span key={key} className="md-c">{m[1]}</span>);
    else if (m[2]) out.push(<span key={key} className="md-s">{m[2]}</span>);
    else if (m[3]) out.push(<span key={key} className="md-n">{m[3]}</span>);
    else out.push(<span key={key} className="md-k">{m[4]}</span>);
    last = m.index + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

function splitRow(line: string): string[] {
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; continue; }
    if (s[i] === "|") { cells.push(cur.trim()); cur = ""; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

interface ListItem { text: string; children: string[] }

function collectList(lines: string[], i: number): { items: ListItem[]; next: number; ordered: boolean } {
  const ordered = /^\s*\d+\.\s+/.test(lines[i]);
  const head = ordered ? /^(\s*)\d+\.\s+(.*)$/ : /^(\s*)[-*]\s+(.*)$/;
  const items: ListItem[] = [];
  while (i < lines.length) {
    const m = lines[i].match(head);
    if (!m) break;
    const indent = m[1].replace(/\t/g, "  ").length;
    if (indent >= 2 && items.length > 0) items[items.length - 1].children.push(m[2]);
    else items.push({ text: m[2], children: [] });
    i++;
  }
  return { items, next: i, ordered };
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${k++}`;

    // code fence
    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const lang = fence[1];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      const code = buf.join("\n");
      out.push(
        <pre key={key} className="md-pre">
          {lang && <span className="md-lang">{lang}</span>}
          <code>{highlight(code, key)}</code>
        </pre>,
      );
      continue;
    }

    if (/^\s*$/.test(line)) { i++; continue; }

    // heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const content = inline(h[2], key);
      if (lvl === 1) out.push(<h1 key={key} className="md-h1">{content}</h1>);
      else if (lvl === 2) out.push(<h2 key={key} className="md-h2">{content}</h2>);
      else out.push(<h3 key={key} className="md-h3">{content}</h3>);
      i++;
      continue;
    }

    // hr
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(<hr key={key} className="md-hr" />);
      i++;
      continue;
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push(<blockquote key={key} className="md-quote">{inline(buf.join(" "), key)}</blockquote>);
      continue;
    }

    // table
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      lines[i + 1].includes("-") &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])
    ) {
      const headCells = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(
        <div key={key} className="md-tablewrap">
          <table className="md-table">
            <thead>
              <tr>{headCells.map((c, ci) => <th key={ci}>{inline(c, `${key}h${ci}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `${key}r${ri}c${ci}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // list
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const { items, next, ordered } = collectList(lines, i);
      i = next;
      const lis = items.map((it, li) => (
        <li key={li}>
          {inline(it.text, `${key}i${li}`)}
          {it.children.length > 0 && (
            <ul className="md-sublist">{it.children.map((c, ci) => <li key={ci}>{inline(c, `${key}i${li}s${ci}`)}</li>)}</ul>
          )}
        </li>
      ));
      out.push(ordered ? <ol key={key} className="md-ol">{lis}</ol> : <ul key={key} className="md-ul">{lis}</ul>);
      continue;
    }

    // paragraph
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? ""))
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(<p key={key} className="md-p">{inline(buf.join(" "), key)}</p>);
  }

  return <div className="md-body">{out}</div>;
}
