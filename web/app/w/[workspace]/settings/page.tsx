/**
 * Who is in this workspace and what each of them may do.
 *
 * Every member can see the list, because knowing who else is here is part of
 * being here. Only the controls are gated, and they are gated on exactly the
 * permissions the server actions check, so nothing is offered that would be
 * refused.
 */

import { Empty, PageHeading, Panel } from "@/components/shell/panel";
import { Timestamp } from "@/components/shell/timestamp";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { countOwners, listMembers } from "@/lib/repositories/members";
import { requireWorkspace } from "@/lib/workspace";

import { AddMemberForm } from "./add-member-form";
import { MemberRowControls } from "./member-row-controls";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { workspace, principal, role } = await requireWorkspace(slug);

  const [members, owners] = await Promise.all([
    listMembers(prisma, workspace.id),
    countOwners(prisma, workspace.id),
  ]);

  const mayAdd = authorize(principal, "member:invite");
  const mayChangeRole = authorize(principal, "member:changeRole");
  const mayRemove = authorize(principal, "member:remove");
  const mayAudit = authorize(principal, "auditLog:view");

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeading
        title="People"
        lead={`Roles decide what each person may do here. You are ${role.toLowerCase()}.`}
      />

      <div className="flex flex-col gap-6">
        {mayAdd ? (
          <Panel title="Add someone">
            <AddMemberForm slug={slug} mayGrantOwner={role === "OWNER"} />
          </Panel>
        ) : null}

        <Panel
          title="Members"
          aside={`${members.length} ${members.length === 1 ? "person" : "people"}`}
        >
          {members.length === 0 ? (
            <Empty>Nobody is in this workspace yet.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {members.map((member) => {
                const isSelf = member.userId === principal.userId;
                // The rule the actions enforce, mirrored here only to explain
                // the disabled control rather than to decide anything.
                const isLastOwner = member.role === "OWNER" && owners <= 1;
                // An owner's row is an owner's business. Showing an admin a
                // control that will refuse them teaches them nothing.
                const touchable = member.role !== "OWNER" || role === "OWNER";

                return (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">
                        {member.user.name ?? member.user.email}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                            you
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {member.user.email}
                        <span className="mx-2">joined</span>
                        <Timestamp at={member.createdAt} />
                      </p>
                    </div>

                    <MemberRowControls
                      slug={slug}
                      userId={member.userId}
                      role={member.role}
                      mayChangeRole={mayChangeRole && touchable}
                      mayRemove={mayRemove && touchable}
                      isSelf={isSelf}
                      isLastOwner={isLastOwner}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {mayAudit ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Changes made here are recorded in the{" "}
            <a
              href={`/w/${slug}/audit`}
              className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              audit log
            </a>
            .
          </p>
        ) : null}
      </div>
    </main>
  );
}
