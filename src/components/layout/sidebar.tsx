"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Compass,
  ChevronsUpDown,
  Plus,
  Trash2,
  Check,
  Settings2,
  Activity,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/hooks/use-explore";
import { DEFAULT_PROJECT_ID } from "@/lib/shared";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get("project") ?? DEFAULT_PROJECT_ID;
  const { data, mutate } = useProjects();
  const projects: { id: string; name: string }[] = data?.projects ?? [];
  const currentProject = projects.find((p) => p.id === projectId);
  const [creating, setCreating] = useState(false);

  const navigateToProject = useCallback(
    (id: string, page?: string) => {
      const params = new URLSearchParams();
      params.set("project", id);
      router.push(`${page ?? pathname}?${params.toString()}`);
    },
    [pathname, router],
  );

  const handleCreate = useCallback(async () => {
    const name = prompt("Project name:");
    if (!name) return;
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!id) return;

    setCreating(true);
    try {
      await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      await mutate();
      navigateToProject(id, "/project");
    } catch {
      // ignore
    }
    setCreating(false);
  }, [mutate, navigateToProject]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm(`Delete project "${id}"? This cannot be undone.`)) return;
      await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await mutate();
      if (projectId === id) {
        const remaining = projects.filter((p) => p.id !== id);
        if (remaining.length > 0) {
          navigateToProject(remaining[0].id);
        }
      }
    },
    [mutate, projectId, projects, navigateToProject],
  );

  function linkWithProject(href: string): string {
    const params = new URLSearchParams();
    params.set("project", projectId);
    return `${href}?${params.toString()}`;
  }

  const isProjectPage = pathname === "/project";
  const isExplorePage = pathname === "/";
  const isPulsePage = pathname === "/pulse";

  const projectInitial = (currentProject?.name ?? projectId)[0]?.toUpperCase() ?? "K";

  return (
    <Sidebar collapsible="icon">
      {/* Project switcher as the header — combined branding + project */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="cursor-pointer"
                  tooltip={currentProject?.name ?? projectId}
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
                    {projectInitial}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold tracking-tight">
                      {currentProject?.name ?? projectId}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      weave
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto h-4 w-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="right"
                sideOffset={4}
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
              >
                {projects.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => navigateToProject(p.id, "/project")}
                    className="gap-2"
                  >
                    <div className="flex size-5 items-center justify-center rounded bg-muted text-[10px] font-bold uppercase">
                      {p.name[0]}
                    </div>
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.id === projectId && (
                      <Check className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {projects.length > 1 && (
                      <Trash2
                        className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
                        }}
                      />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleCreate} disabled={creating}>
                  <Plus className="h-4 w-4" />
                  <span>New Project</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarMenu className="px-2 py-1">
          {/* Project config */}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isProjectPage}
              tooltip="Project"
            >
              <Link href={linkWithProject("/project")}>
                <Settings2 />
                <span>Project</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Explore */}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isExplorePage}
              tooltip="Explore"
            >
              <Link href={linkWithProject("/")}>
                <Compass />
                <span>Explore</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Pulse */}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isPulsePage}
              tooltip="Pulse"
            >
              <Link href={linkWithProject("/pulse")}>
                <Activity />
                <span>Pulse</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
