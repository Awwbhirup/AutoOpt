"use client";

/**
 * The command palette (Ctrl or Cmd + K) and the keyboard shortcuts around it:
 * "g" then a letter to jump between sections, "?" for the list of them.
 *
 * Programs, suites and recent runs are fetched the first time the palette
 * opens and refreshed on later opens, so pages that never open it pay nothing.
 */

import { Command } from "cmdk";
import { Dialog as Primitive } from "radix-ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { PaletteData } from "@/app/api/w/[slug]/palette/route";
import { IDLE_SEQUENCE, isTypingTarget, pressKey, shortcutHref, SHORTCUTS } from "@/lib/shortcuts";

export interface PaletteWorkspace {
  slug: string;
  name: string;
}

const noop = () => () => {};
function useModifierLabel(): string {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "Cmd" : "Ctrl"),
    () => "Ctrl",
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-line bg-foreground/5 px-1.5 py-0.5 font-terminal text-[0.72rem] text-muted">
      {children}
    </kbd>
  );
}

const ITEM =
  "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground data-[selected=true]:bg-foreground/[0.07] aria-disabled:opacity-40";
const GROUP =
  "px-1 pb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[0.72rem] [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:uppercase";

export function CommandPalette({ slug, workspaces }: { slug: string; workspaces: PaletteWorkspace[] }) {
  const router = useRouter();
  const modifier = useModifierLabel();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [data, setData] = useState<PaletteData | null>(null);
  const [failed, setFailed] = useState(false);
  const loadedAt = useRef(0);
  const sequence = useRef(IDLE_SEQUENCE);

  const load = useCallback(async () => {
    if (Date.now() - loadedAt.current < 30_000) return;
    loadedAt.current = Date.now();
    try {
      const response = await fetch(`/api/w/${slug}/palette`);
      if (!response.ok) throw new Error(String(response.status));
      setData((await response.json()) as PaletteData);
      setFailed(false);
    } catch {
      setFailed(true);
      loadedAt.current = 0;
    }
  }, [slug]);

  const show = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) void load();
    },
    [load],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        show(!open);
        return;
      }
      if (open || help || isTypingTarget(event.target as HTMLElement | null)) return;
      if (event.key === "?") {
        event.preventDefault();
        setHelp(true);
        return;
      }
      const result = pressKey(sequence.current, event.key, Date.now(), event.metaKey || event.ctrlKey || event.altKey);
      sequence.current = result.state;
      if (result.match) {
        event.preventDefault();
        router.push(shortcutHref(result.match, slug));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, help, show, router, slug]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => show(true)}
        className="ui-focus hidden items-center gap-2 rounded-md border border-line bg-foreground/[0.03] px-2.5 py-1 text-sm text-muted transition-colors hover:border-foreground/25 hover:text-foreground md:flex"
      >
        Search
        <Kbd>{`${modifier} K`}</Kbd>
      </button>
      <button
        type="button"
        onClick={() => show(true)}
        aria-label="Search"
        className="ui-focus grid size-8 place-items-center rounded-md text-muted hover:bg-foreground/5 hover:text-foreground md:hidden"
      >
        <svg aria-hidden viewBox="0 0 16 16" className="size-4">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={show}
        label="Command palette"
        overlayClassName="ui-fade fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
        contentClassName="ui-pop glass glass--card fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl bg-surface font-display text-foreground"
      >
        <Primitive.Title className="sr-only">Command palette</Primitive.Title>
        <Primitive.Description className="sr-only">Jump to a page, program, suite or run.</Primitive.Description>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <svg aria-hidden viewBox="0 0 16 16" className="size-4 text-muted">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <Command.Input
            placeholder="Jump to a page, program, suite or run"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <Kbd>Esc</Kbd>
        </div>
        <Command.List className="max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain py-1" data-lenis-prevent>
          <Command.Empty className="px-4 py-8 text-center text-sm text-muted">Nothing matches.</Command.Empty>

          <Command.Group heading="Go to" className={GROUP}>
            {SHORTCUTS.map((shortcut) => (
              <Command.Item key={shortcut.label} value={`go ${shortcut.label}`} onSelect={() => go(shortcutHref(shortcut, slug))} className={ITEM}>
                <span className="flex-1">{shortcut.label}</span>
                <span className="flex gap-1">
                  <Kbd>{shortcut.keys[0]}</Kbd>
                  <Kbd>{shortcut.keys[1]}</Kbd>
                </span>
              </Command.Item>
            ))}
            <Command.Item value="go shared links" onSelect={() => go(`/w/${slug}/shares`)} className={ITEM}>
              Shared links
            </Command.Item>
            <Command.Item value="go docs language" onSelect={() => go("/docs")} className={ITEM}>
              Language docs
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Create" className={GROUP}>
            <Command.Item value="new project create" onSelect={() => go(`/w/${slug}/projects?new=project`)} className={ITEM}>
              New project
            </Command.Item>
            <Command.Item value="new suite benchmark create" onSelect={() => go(`/w/${slug}/suites?new=suite`)} className={ITEM}>
              New benchmark suite
            </Command.Item>
          </Command.Group>

          {data === null ? (
            <p className="px-4 py-3 text-xs text-muted">{failed ? "Could not load programs and runs." : "Loading programs and runs..."}</p>
          ) : (
            <>
              {data.programs.length > 0 ? (
                <Command.Group heading="Programs" className={GROUP}>
                  {data.programs.map((program) => (
                    <Command.Item
                      key={program.id}
                      value={`program ${program.name} ${program.project} ${program.id}`}
                      onSelect={() => go(`/w/${slug}/programs/${program.id}`)}
                      className={ITEM}
                    >
                      <span className="flex-1 truncate">{program.name}</span>
                      <span className="truncate text-xs text-muted">{program.project}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {data.suites.length > 0 ? (
                <Command.Group heading="Suites" className={GROUP}>
                  {data.suites.map((suite) => (
                    <Command.Item key={suite.id} value={`suite ${suite.name} ${suite.id}`} onSelect={() => go(`/w/${slug}/suites/${suite.id}`)} className={ITEM}>
                      {suite.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {data.runs.length > 0 ? (
                <Command.Group heading="Recent runs" className={GROUP}>
                  {data.runs.map((run) => (
                    <Command.Item key={run.id} value={`run ${run.program} ${run.method} ${run.id}`} onSelect={() => go(`/w/${slug}/runs/${run.id}`)} className={ITEM}>
                      <span className="flex-1 truncate">
                        {run.program} <span className="text-muted">{run.method}</span>
                      </span>
                      <span className="font-terminal text-xs text-muted tabular-nums">
                        {run.reduction === null ? run.status : `${run.reduction.toFixed(1)}%`}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
            </>
          )}

          {workspaces.length > 1 ? (
            <Command.Group heading="Switch workspace" className={GROUP}>
              {workspaces
                .filter((workspace) => workspace.slug !== slug)
                .map((workspace) => (
                  <Command.Item key={workspace.slug} value={`workspace ${workspace.name}`} onSelect={() => go(`/w/${workspace.slug}`)} className={ITEM}>
                    {workspace.name}
                  </Command.Item>
                ))}
            </Command.Group>
          ) : null}

          <Command.Group heading="Help" className={GROUP}>
            <Command.Item
              value="keyboard shortcuts help"
              onSelect={() => {
                setOpen(false);
                setHelp(true);
              }}
              className={ITEM}
            >
              <span className="flex-1">Keyboard shortcuts</span>
              <Kbd>?</Kbd>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command.Dialog>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent title="Keyboard shortcuts" description="Anywhere in a workspace, outside a text field.">
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 text-sm">
            <dt>Command palette</dt>
            <dd className="flex gap-1">
              <Kbd>{modifier}</Kbd>
              <Kbd>K</Kbd>
            </dd>
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.label} className="contents">
                <dt>{shortcut.label}</dt>
                <dd className="flex gap-1">
                  <Kbd>{shortcut.keys[0]}</Kbd>
                  <Kbd>{shortcut.keys[1]}</Kbd>
                </dd>
              </div>
            ))}
            <dt>This list</dt>
            <dd>
              <Kbd>?</Kbd>
            </dd>
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
