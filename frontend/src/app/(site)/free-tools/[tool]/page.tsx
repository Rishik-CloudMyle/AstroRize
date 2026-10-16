import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Breadcrumbs from "@/components/breadcrumbs";
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
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Free tools", href: "/free-tools" }, { label: tool.name }]} />

      <div className="relative mt-1 overflow-hidden rounded-3xl" style={{ background: tool.bg }}>
        <Image src={tool.art} alt="" fill priority sizes="(max-width: 1240px) 100vw, 1240px" className="object-cover" />
        {/* Text sits on solid colour; the art stays visible beside it (sm+) or below it (phones,
            where the text spans the full width). */}
        <div
          className="absolute inset-0 bg-[linear-gradient(180deg,var(--scrim)_0%,var(--scrim)_58%,transparent_100%)] sm:bg-[linear-gradient(90deg,var(--scrim)_0%,var(--scrim)_40%,transparent_85%)]"
          style={{ "--scrim": tool.scrim } as React.CSSProperties}
        />
        <div className="relative max-w-[560px] px-5 pb-28 pt-9 sm:px-8 sm:py-12">
          <div className="text-[11px] font-bold uppercase tracking-[.12em]" style={{ color: tool.ink, opacity: 0.8 }}>
            Free tool · {tool.sub}
          </div>
          <h1 className="mt-1.5 font-display text-[40px] font-semibold leading-none sm:text-5xl" style={{ color: tool.ink }}>
            {tool.name}
          </h1>
          <p className="mt-3 max-w-[46ch] text-[15px] leading-normal" style={{ color: tool.ink }}>
            {tool.description}
          </p>
        </div>
      </div>

      {/* The tools read their shared-result links (?sign=, ?cards=, …) on the client. */}
      <Suspense fallback={<div className="mt-6 h-48 animate-pulse rounded-3xl border border-line bg-paper" />}>
        <ToolRunner tool={tool} />
      </Suspense>

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-bold text-ink">More free tools</h2>
        <div className="flex flex-wrap gap-2">
          {tools
            .filter((t) => t.id !== tool.id)
            .map((t) => (
              <Link
                key={t.id}
                href={`/free-tools/${t.id}`}
                className="inline-flex h-9 items-center rounded-full border border-line bg-white px-4 text-[13px] font-semibold text-ink hover:border-amber-300 hover:text-ink hover:no-underline"
              >
                {t.name}
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
