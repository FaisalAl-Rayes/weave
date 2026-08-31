"use client";

import { Fragment, useEffect, useState } from "react";
import * as YAML from "yaml";
import { Copy, Check, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Lang = "yaml" | "json";

function ValueToken({ value }: { value: string }) {
  if (!value) return null;
  if (value === "true" || value === "false" || value === "null") {
    return <span className="text-amber-400">{value}</span>;
  }
  if (/^-?\d/.test(value)) {
    return <span className="text-emerald-400">{value}</span>;
  }
  if (value.startsWith("'") || value.startsWith('"')) {
    return <span className="text-orange-300">{value}</span>;
  }
  return <span className="text-zinc-300">{value}</span>;
}

// Each line renders as an inline fragment inside a <pre>, which preserves indentation.
function YamlLine({ line }: { line: string }) {
  const indent = line.match(/^(\s*)/)?.[1] ?? "";
  const rest = line.slice(indent.length);

  if (rest.startsWith("#")) {
    return <>{indent}<span className="text-zinc-500">{rest}</span></>;
  }

  if (rest === "-" || rest.startsWith("- ")) {
    const value = rest.slice(rest === "-" ? 1 : 2);
    return <>{indent}<span className="text-zinc-500">- </span><ValueToken value={value} /></>;
  }

  const colonEnd = rest.endsWith(":");
  const colonIdx = rest.indexOf(": ");
  if (colonIdx > 0 || colonEnd) {
    const key = colonEnd ? rest.slice(0, -1) : rest.slice(0, colonIdx);
    const value = colonEnd ? "" : rest.slice(colonIdx + 2);
    return (
      <>
        {indent}
        <span className="text-sky-400">{key}</span>
        <span className="text-zinc-500">:</span>
        {value ? <> <ValueToken value={value} /></> : null}
      </>
    );
  }

  return <>{indent}<ValueToken value={rest} /></>;
}

function JsonLine({ line }: { line: string }) {
  const indent = line.match(/^(\s*)/)?.[1] ?? "";
  const rest = line.slice(indent.length);

  const keyMatch = rest.match(/^("[\w\s\-./]+")\s*:\s*(.*)/);
  if (keyMatch) {
    const [, key, value] = keyMatch;
    const val = value.replace(/,$/, "");
    return (
      <>
        {indent}
        <span className="text-sky-400">{key}</span>
        <span className="text-zinc-500">: </span>
        <ValueToken value={val} />
        {value.endsWith(",") && <span className="text-zinc-500">,</span>}
      </>
    );
  }

  if (/^[{}\[\]]/.test(rest.trim())) {
    return <>{indent}<span className="text-zinc-500">{rest}</span></>;
  }

  const val = rest.replace(/,$/, "");
  return (
    <>
      {indent}
      <ValueToken value={val} />
      {rest.endsWith(",") && <span className="text-zinc-500">,</span>}
    </>
  );
}

function HighlightedCode({ content, lang }: { content: string; lang: Lang }) {
  const lines = content.split("\n");
  return (
    <pre className="text-[11px] font-mono leading-5">
      {lines.map((line, i) => (
        <Fragment key={i}>
          {lang === "yaml" ? <YamlLine line={line} /> : <JsonLine line={line} />}
          {i < lines.length - 1 && "\n"}
        </Fragment>
      ))}
    </pre>
  );
}

interface CodeBlockProps {
  data: unknown;
  defaultLang?: Lang;
  maxHeight?: string;
}

function Toolbar({
  lang,
  onLangChange,
  copied,
  onCopy,
  onExpand,
}: {
  lang: Lang;
  onLangChange: (l: Lang) => void;
  copied: boolean;
  onCopy: () => void;
  onExpand?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-zinc-900/60">
      <div className="flex gap-1">
        {(["yaml", "json"] as Lang[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onLangChange(l)}
            className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
              lang === l
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {onExpand && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-zinc-500 hover:text-zinc-300"
            onClick={onExpand}
            title="Expand"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-zinc-500 hover:text-zinc-300"
          onClick={onCopy}
          title="Copy"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

export function CodeBlock({ data, defaultLang = "yaml", maxHeight = "max-h-96" }: CodeBlockProps) {
  const [lang, setLang] = useState<Lang>(defaultLang);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Inert everything outside the Radix portal while expanded so Cmd+F
  // only searches within the dialog, not the page behind it.
  useEffect(() => {
    if (!expanded) return;
    const inerted: HTMLElement[] = [];
    for (const el of Array.from(document.body.children) as HTMLElement[]) {
      if (!el.hasAttribute("data-radix-portal")) {
        el.setAttribute("inert", "");
        inerted.push(el);
      }
    }
    return () => inerted.forEach((el) => el.removeAttribute("inert"));
  }, [expanded]);

  const content =
    lang === "yaml"
      ? YAML.stringify(data, { lineWidth: 0 })
      : JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <>
      <div className="rounded-md border border-border/50 bg-zinc-950 overflow-hidden">
        <Toolbar
          lang={lang}
          onLangChange={setLang}
          copied={copied}
          onCopy={handleCopy}
          onExpand={() => setExpanded(true)}
        />
        <div className={`overflow-auto ${maxHeight} px-3 py-2`}>
          <HighlightedCode content={content} lang={lang} />
        </div>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-5xl w-full h-[85vh] flex flex-col bg-zinc-950 border-border/50 p-0">
          <DialogHeader className="px-4 pt-4 pb-0 shrink-0">
            <DialogTitle className="text-sm font-mono text-muted-foreground">Raw</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col flex-1 overflow-hidden px-4 pb-4 gap-2">
            <Toolbar
              lang={lang}
              onLangChange={setLang}
              copied={copied}
              onCopy={handleCopy}
            />
            <div className="overflow-auto flex-1 px-3 py-2">
              <HighlightedCode content={content} lang={lang} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
