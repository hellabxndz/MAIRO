"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { changeMemberRole, leaveBusiness, removeMember, setAdminGrant } from "@/lib/team/actions";

export function MemberActions({
  memberId,
  role,
  isSelf,
  integrationsGrant,
}: {
  memberId: string;
  role: string;
  isSelf: boolean;
  integrationsGrant: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; message: string } | void>) =>
    start(async () => {
      const res = await fn();
      if (res) setMessage({ ok: res.ok, text: res.message });
    });

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        {!isSelf && (
          <Select
            aria-label="Role"
            className="h-9 w-40 text-xs"
            defaultValue={role}
            disabled={pending}
            onChange={(e) => run(() => changeMemberRole(memberId, e.target.value))}
          >
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="support_agent">Support Agent</option>
          </Select>
        )}
        {isSelf ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => leaveBusiness())}>Leave business</Button>
        ) : confirmRemove ? (
          <>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => removeMember(memberId))}>
              {pending && <Loader2 className="animate-spin" />} Confirm remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>Cancel</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>Remove</Button>
        )}
      </div>
      {role === "admin" && !isSelf && (
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            defaultChecked={integrationsGrant}
            disabled={pending}
            onChange={(e) => run(() => setAdminGrant(memberId, "integrations.manage", e.target.checked))}
            className="accent-violet"
          />
          Can manage integrations
        </label>
      )}
      {message && <p role="status" className={message.ok ? "text-xs text-success" : "text-xs text-danger"}>{message.text}</p>}
    </div>
  );
}

export function LeaveButton() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => {
        const res = await leaveBusiness();
        if (res && !res.ok) setMessage(res.message);
      })}>Leave business</Button>
      {message && <p className="text-xs text-danger">{message}</p>}
    </div>
  );
}
