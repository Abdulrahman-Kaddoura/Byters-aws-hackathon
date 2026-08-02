import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { LoadingState, EmptyState, TagList } from '@/components/common';
import { useGroupList, usePermissionCatalog, useCreateGroup, useUpdateGroup, useDeleteGroup } from '@/hooks/useAdmin';
import type { PermissionCatalogEntry, PermissionGroup } from '@/types';

export function AdminGroups() {
  const { data: groups = [], isLoading } = useGroupList();
  const { data: permissions = [] } = usePermissionCatalog();
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PermissionGroup | null>(null);

  const labelFor = (key: string) => permissions.find((p) => p.key === key)?.label ?? key;

  if (isLoading) return <LoadingState label="Loading groups…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {groups.length} permission group{groups.length === 1 ? '' : 's'}
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Group
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="No permission groups yet" description="Create one to assign to users." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.id} className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => setEditing(g)}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{g.name}</p>
                  {g.isSystem && <Badge variant="secondary">System</Badge>}
                </div>
                {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
                <TagList items={g.permissions.map(labelFor)} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <GroupSheet
        open={createOpen}
        group={null}
        permissions={permissions}
        submitting={createGroup.isPending}
        onClose={() => setCreateOpen(false)}
        onSave={(patch) =>
          createGroup
            .mutateAsync({ name: patch.name!, description: patch.description, permissions: patch.permissions })
            .then(() => {
              toast.success('Group created');
              setCreateOpen(false);
            })
            .catch((err) => toast.error((err as Error).message))
        }
      />

      <GroupSheet
        open={!!editing}
        group={editing}
        permissions={permissions}
        submitting={updateGroup.isPending || deleteGroup.isPending}
        onClose={() => setEditing(null)}
        onSave={(patch) =>
          updateGroup
            .mutateAsync({ id: editing!.id, patch })
            .then(() => {
              toast.success('Group updated');
              setEditing(null);
            })
            .catch((err) => toast.error((err as Error).message))
        }
        onDelete={
          editing && !editing.isSystem
            ? () =>
                deleteGroup
                  .mutateAsync(editing.id)
                  .then(() => {
                    toast.success('Group deleted');
                    setEditing(null);
                  })
                  .catch((err) => toast.error((err as Error).message))
            : undefined
        }
      />
    </div>
  );
}

function GroupSheet({
  open,
  group,
  permissions,
  submitting,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  group: PermissionGroup | null;
  permissions: PermissionCatalogEntry[];
  submitting: boolean;
  onClose: () => void;
  onSave: (patch: { name?: string; description?: string; permissions?: string[] }) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? '');
    setDescription(group?.description ?? '');
    setSelected(group?.permissions ?? []);
  }, [open, group]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{group ? group.name : 'New group'}</SheetTitle>
          {group?.isSystem && (
            <SheetDescription>
              System group — permissions can be edited, but it can't be deleted (it backs one of the 4 built-in roles).
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Triage Nurse" autoFocus={!group} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Permissions</Label>
            <div className="divide-y rounded-md border">
              {permissions.map((p) => (
                <label key={p.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>{p.label}</span>
                  <Switch
                    checked={selected.includes(p.key)}
                    onCheckedChange={(checked) => setSelected((prev) => (checked ? [...prev, p.key] : prev.filter((k) => k !== p.key)))}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
        <SheetFooter className="sm:justify-between">
          {onDelete ? (
            <Button variant="destructive" onClick={onDelete} disabled={submitting}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onSave({ name, description, permissions: selected })} disabled={submitting || !name.trim()}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
