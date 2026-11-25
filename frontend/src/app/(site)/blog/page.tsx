import type { Metadata } from "next";
import BlogList from "@/components/blog/blog-list";
import Breadcrumbs from "@/components/breadcrumbs";
import { getArticles } from "@/lib/mock/blog";

export const metadata: Metadata = {
  title: "Stories & Blogs",
  description: "Practical, calm reads on astrology, career, relationships, Vastu and wellness from AstroRize.",
};

export default function BlogPage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 lg:px-6 max-lg:pt-4">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog" }]} className="mb-2.5 max-lg:hidden" />
      <h1 className="font-display text-[36px] font-semibold text-ink sm:text-[42px] max-lg:text-[30px]">Stories &amp; Blogs</h1>
      <p className="mt-1.5 mb-5 text-sm text-stone-600">Practical, calm reads on astrology, career, relationships, Vastu and wellness.</p>
      <BlogList articles={getArticles()} />
    </div>
  );
}
