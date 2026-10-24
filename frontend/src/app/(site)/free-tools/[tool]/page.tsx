import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Breadcrumbs from "@/components/breadcrumbs";
import { AppTopbar } from "@/components/mobile/page-title";
import { ToolGlyph } from "@/components/tools/tool-icons";
import ToolRunner from "@/components/tools/tool-runner";
import { getTool, getTools } from "@/lib/tools";

export const dynamicParams = false;

export async function generateStaticParams() {
  const tools = await getTools();
  return tools.map((t) => ({ tool: t.id }));
}

export async function generateMetadata(props: PageProps<"/free-tools/[tool]">): Promise<Metadata> {
  const { tool: id } = await props.params;
  const tool = await getTool(id);
  if (!tool) return {};
  return { title: `Free ${tool.name} — ${tool.sub}`, description: tool.description };
}

export default async function ToolPage(props: PageProps<"/free-tools/[tool]">) {
  const { tool: id } = await props.params;
  const [tool, tools] = await Promise.all([getTool(id), getTools()]);
  if (!tool) notFound();

  return (
    // Phones and tablets: the app's title bar, then a compact art card and the tool's screens.
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6 max-lg:p-0! max-lg:pb-8!">
      <AppTopbar title={tool.name} subtitle={`Free tool · ${tool.sub}`} backHref="/free-tools" backLabel="All free tools" className="lg:hidden" />
      <div className="max-lg:px-4 max-lg:pt-3">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Free tools", href: "/free-tools" }, { label: tool.name }]}
        className="mb-2.5 max-lg:hidden"
      />

      <div className="relative mt-1 overflow-hidden rounded-3xl max-lg:mt-0 max-lg:rounded-app-card" style={{ background: tool.bg }}>
        <Image src={tool.art} alt="" fill priority sizes="(max-width: 1240px) 100vw, 1240px" className="object-cover" />
        {/* Text sits on solid colour; the art stays visible beside it (sm+) or below it (phones,
            where the text spans the full width). */}
        <div
          className="absolute inset-0 bg-[linear-gradient(180deg,var(--scrim)_0%,var(--scrim)_58%,transparent_100%)] sm:bg-[linear-gradient(90deg,var(--scrim)_0%,var(--scrim)_40%,transparent_85%)]"
          style={{ "--scrim": tool.scrim } as React.CSSProperties}
        />
        <div className="relative max-w-[560px] px-5 pb-28 pt-9 sm:px-8 sm:py-12 max-lg:px-4! max-lg:pt-4! max-lg:pb-16!">
          <div className="text-[11px] font-bold uppercase tracking-[.12em] max-lg:hidden" style={{ color: tool.ink, opacity: 0.8 }}>
            Free tool · {tool.sub}
          </div>
          {/* The title bar carries the page's <h1> on phones/tablets. */}
          <h1 className="mt-1.5 font-display text-[40px] font-semibold leading-none sm:text-5xl max-lg:hidden" style={{ color: tool.ink }}>
            {tool.name}
          </h1>
          <p className="mt-3 max-w-[46ch] text-[15px] leading-normal max-lg:mt-0 max-lg:text-[13.5px] max-lg:font-medium" style={{ color: tool.ink }}>
            {tool.description}
          </p>
        </div>
      </div>

      {/* The tools read their shared-result links (?sign=, ?cards=, …) on the client. */}
      <Suspense fallback={<div className="mt-6 h-48 animate-pulse rounded-3xl border border-line-warm bg-paper" />}>
        <ToolRunner tool={tool} />
      </Suspense>

      <div className="mt-10 max-lg:mt-[22px]">
        <h2 className="mb-3 font-display text-[24px] font-semibold text-ink max-lg:mb-2.5 max-lg:font-sans max-lg:text-[16px] max-lg:font-bold">More free tools</h2>
        <div className="flex flex-wrap gap-2 max-lg:-mx-4 max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:px-4 max-lg:pb-0.5 max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden">
          {tools
            .filter((t) => t.id !== tool.id)
            .map((t) => (
              <Link
                key={t.id}
                href={`/free-tools/${t.id}`}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line-warm bg-paper pl-3 pr-4 text-[13.5px] font-semibold text-ink shadow-[0_2px_6px_rgba(62,38,18,.05)] hover:border-amber-300 hover:text-ink hover:no-underline max-lg:h-[34px] max-lg:flex-none max-lg:border-app-line-gold max-lg:bg-app-surface max-lg:text-[12px] max-lg:font-bold max-lg:whitespace-nowrap max-lg:shadow-none"
              >
                <ToolGlyph id={t.id} className="size-[18px] text-amber-700" />
                {t.name}
              </Link>
            ))}
        </div>
      </div>
      </div>
    </div>
  );
}
