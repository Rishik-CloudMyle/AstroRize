import AccessDenied from "@/components/admin/access-denied";
import MessagesConsole from "@/components/admin/messages/messages-console";
import { PageTitle } from "@/components/admin/ui";
import { getInbox, getInboxThread } from "@/lib/admin/api";
import { allowed } from "@/lib/admin/guard";

export const metadata = { title: "Messages" };

export default async function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  if (!(await allowed("messages"))) return <AccessDenied />;
  const [inbox, sp] = await Promise.all([getInbox(), searchParams]);
  // ?c=<id> opens that conversation (a link from elsewhere, or a reload).
  const asked = typeof sp.c === "string" ? sp.c : null;
  const thread = asked ? await getInboxThread(asked) : null;

  return (
    <div>
      <PageTitle
        title="Messages"
        sub="Talk with colleagues in any department, with astrologers and with customers. Only the people in a conversation can read it."
      />
      <MessagesConsole initialInbox={inbox} initialThread={thread} />
    </div>
  );
}
