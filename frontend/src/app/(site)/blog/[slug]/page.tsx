import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/breadcrumbs";
import { getArticle, getArticles } from "@/lib/mock/blog";

export function generateStaticParams() {
  return getArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = getArticle((await params).slug);
  return a ? { title: a.title, description: a.blurb } : { title: "Story not found" };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = getArticle((await params).slug);
  if (!a) notFound();
  return (
    <div className="mx-auto max-w-[760px] px-4 pb-16 pt-8 lg:px-6 max-lg:pt-4">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }, { label: a.title }]} className="mb-3 max-lg:hidden" />
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-stone-900">
        <Image src={a.image} alt="" fill priority sizes="(min-width:768px) 760px, 100vw" className="object-cover" />
      </div>
      <span className="mt-5 block text-[11px] font-bold tracking-[.08em] text-amber-800 uppercase">{a.category}</span>
      <h1 className="m-0 mt-1.5 font-display text-[32px] leading-tight font-semibold text-ink sm:text-[40px]">{a.title}</h1>
      <p className="mt-2 mb-5 text-[13px] text-stone-500">{a.date}</p>
      {a.body.map((p, i) => (
        <p key={i} className="my-3 text-[16px] leading-[1.7] text-stone-700">
          {p}
        </p>
      ))}
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href="/astrologers" className="az-cta inline-flex h-12 items-center rounded-full px-6 text-[14.5px] font-bold hover:no-underline">
          Ask an astrologer
        </Link>
        <Link href="/blog" className="inline-flex h-12 items-center rounded-full border border-line bg-white px-6 text-[14.5px] font-bold text-ink hover:text-ink hover:no-underline">
          ← All stories
        </Link>
      </div>
    </div>
  );
}
