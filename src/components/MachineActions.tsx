"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Terminal } from "@/components/Terminal";
import { refreshMachine, setSshUser, disableMachine } from "@/actions/machines";
import type { Machine } from "@prisma/client";

interface Props {
  machine: Machine;
}

export function MachineActions({ machine }: Props) {
  const [editing, setEditing] = useState(!machine.sshUser);
  const [user, setUser] = useState(machine.sshUser ?? "");
  const [pending, start] = useTransition();
  const [showTerminal, setShowTerminal] = useState(false);
  // Host the WS lives on — we infer it from window.location at runtime
  const hubHost = typeof window !== "undefined" ? window.location.hostname : "";

  async function save() {
    start(async () => {
      await setSshUser(machine.id, user.trim());
      setEditing(false);
    });
  }

  async function probe() {
    start(async () => {
      await refreshMachine(machine.id);
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {editing ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="ssh user (e.g. mi, midev)"
            className="mono flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
          />
          <Button size="sm" disabled={pending || !user.trim()} onClick={save}>
            Save
          </Button>
          {machine.sshUser && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={probe}>
            {pending ? "Probing…" : "Probe"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowTerminal(true)}>
            Terminal
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit user
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => start(async () => await disableMachine(machine.id))}
          >
            Disable
          </Button>
        </div>
      )}
      {showTerminal && (
        <Terminal
          machineId={machine.id}
          machineName={machine.name}
          hubHost={hubHost}
          onClose={() => setShowTerminal(false)}
        />
      )}
    </div>
  );
}
