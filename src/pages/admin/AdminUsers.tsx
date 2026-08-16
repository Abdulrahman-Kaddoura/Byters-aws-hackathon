import { useEffect, useState } from 'react';
import { Plus, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { LoadingState, EmptyState, TagList } from '@/components/common';
import { useUserList, useGroupList, usePermissionCatalog, useCreateUser, useUpdateUser } from '@/hooks/useAdmin';
import type { AppUser, CognitoGroup, PermissionCatalogEntry, PermissionGroup } from '@/types';

// The three kinds of account holder. Patients never sign in — a nurse admits
// them and hands over her own device for the AI interview.
const COGNITO_GROUPS: CognitoGroup[] = ['doctor', 'nurse', 'admin'];

export function AdminUsers() {
  const { data: users = [], isLoading } = useUserList();
  const { data: groups = [] } = useGroupList();
  const { data: permissions = [] } = usePermissionCatalog();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [newCredential, setNewCredential] = useState<{ username: string; password: string } | null>(null);

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id;

  if (isLoading) return <LoadingState label="Loading users…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {users.length} account{users.length === 1 ? '' : 's'}
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New User
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <EmptyState title="No users yet" description="Create the first hospital account." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Permission groups</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.sub} className="cursor-pointer" onClick={() => setEditing(u)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{u.username}</p>
                        {u.isSuperAdmin && (
                          <Badge variant="outline" className="text-[10px]">
                            Super admin
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {u.cognitoGroup}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TagList items={u.customGroups.map(groupName)} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.status === 'active' ? 'success' : 'secondary'} className="capitalize">
                        {u.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateUserSheet
        open={createOpen}
        groups={groups}
        submitting={createUser.isPending}
        onClose={() => setCreateOpen(false)}
        onCreate={(payload) =>
          createUser
            .mutateAsync(payload)
            .then((res) => {
              setCreateOpen(false);
              setNewCredential({ username: res.user.username, password: res.temporaryPassword });
            })
            .catch((err) => toast.error((err as Error).message))
        }
      />

      <TempPasswordSheet value={newCredential} onClose={() => setNewCredential(null)} />

      <EditUserSheet
        user={editing}
        groups={groups}
        permissions={permissions}
        submitting={updateUser.isPending}
        onClose={() => setEditing(null)}
        onSave={(sub, patch) =>
          updateUser
            .mutateAsync({ sub, patch })
            .then(() => {
              toast.success('User updated');
              setEditing(null);
            })
            .catch((err) => toast.error((err as Error).message))
        }
      />
    </div>
  );
}

function CreateUserSheet({
  open,
  groups,
  submitting,
  onClose,
  onCreate,
}: {
  open: boolean;
  groups: PermissionGroup[];
  submitting: boolean;
  onClose: () => void;
  onCreate: (payload: { username: string; email: string; name?: string; cognitoGroup: CognitoGroup; customGroups?: string[] }) => void;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [cognitoGroup, setCognitoGroup] = useState<CognitoGroup>('doctor');
  const [customGroups, setCustomGroups] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setUsername('');
    setEmail('');
    setName('');
    setCognitoGroup('doctor');
    setCustomGroups([]);
  }, [open]);

  function submit() {
    onCreate({
      username: username.trim(),
      email: email.trim(),
      name: name.trim() || undefined,
      cognitoGroup,
      customGroups: customGroups.length ? customGroups : undefined,
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New user</SheetTitle>
          <SheetDescription>Creates a Cognito account with a one-time temporary password.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="dr.karim" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="karim@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Full name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Karim Haddad" />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={cognitoGroup} onValueChange={(v) => setCognitoGroup(v as CognitoGroup)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COGNITO_GROUPS.map((g) => (
                  <SelectItem key={g} value={g} className="capitalize">
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Permission groups</Label>
            <p className="text-xs text-muted-foreground">Leave unchecked to use the default group for this role.</p>
            <div className="space-y-2 rounded-md border p-3">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center justify-between text-sm">
                  <span>{g.name}</span>
                  <Switch
                    checked={customGroups.includes(g.id)}
                    onCheckedChange={(checked) =>
                      setCustomGroups((prev) => (checked ? [...prev, g.id] : prev.filter((id) => id !== g.id)))
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !username.trim() || !email.trim()}>
            {submitting ? 'Creating…' : 'Create user'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function TempPasswordSheet({ value, onClose }: { value: { username: string; password: string } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  function copy() {
    navigator.clipboard.writeText(value!.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value.username} created</SheetTitle>
          <SheetDescription>
            One-time temporary password — shown only now. Share it with the user; they'll set their own permanent password the
            first time they sign in.
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2.5 font-mono text-sm">
            <span>{value.password}</span>
            <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy password">
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <SheetFooter>
          <Button onClick={onClose}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

type OverrideState = 'inherit' | 'allow' | 'deny';

function EditUserSheet({
  user,
  groups,
  permissions,
  submitting,
  onClose,
  onSave,
}: {
  user: AppUser | null;
  groups: PermissionGroup[];
  permissions: PermissionCatalogEntry[];
  submitting: boolean;
  onClose: () => void;
  onSave: (
    sub: string,
    patch: {
      cognitoGroup?: CognitoGroup;
      customGroups?: string[];
      permissionOverrides?: Record<string, boolean>;
      status?: 'active' | 'disabled';
    }
  ) => void;
}) {
  const [cognitoGroup, setCognitoGroup] = useState<CognitoGroup>('doctor');
  const [customGroups, setCustomGroups] = useState<string[]>([]);
  const [status, setStatus] = useState<'active' | 'disabled'>('active');
  const [overrides, setOverrides] = useState<Record<string, OverrideState>>({});

  useEffect(() => {
    if (!user) return;
    setCognitoGroup(user.cognitoGroup);
    setCustomGroups(user.customGroups);
    setStatus(user.status);
    const initial: Record<string, OverrideState> = {};
    for (const p of permissions) {
      const v = user.permissionOverrides[p.key];
      initial[p.key] = v === true ? 'allow' : v === false ? 'deny' : 'inherit';
    }
    setOverrides(initial);
  }, [user, permissions]);

  if (!user) return null;

  const isSuperAdmin = user.isSuperAdmin;
  const ADMIN_GROUP_ID = 'system-admin';
  const USERS_MANAGE = 'users.manage';

  function submit() {
    const permissionOverrides: Record<string, boolean> = {};
    for (const [key, v] of Object.entries(overrides)) {
      if (v === 'allow') permissionOverrides[key] = true;
      if (v === 'deny') permissionOverrides[key] = false;
    }
    onSave(user!.sub, { cognitoGroup, customGroups, permissionOverrides, status });
  }

  return (
    <Sheet open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{user.username}</SheetTitle>
          <SheetDescription>{user.email}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {isSuperAdmin && (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              This is the protected super admin account. Its status, role, admin group membership, and
              user-management access can't be changed here.
            </p>
          )}

          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch
              checked={status === 'active'}
              disabled={isSuperAdmin}
              onCheckedChange={(c) => setStatus(c ? 'active' : 'disabled')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={cognitoGroup} onValueChange={(v) => setCognitoGroup(v as CognitoGroup)} disabled={isSuperAdmin}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COGNITO_GROUPS.map((g) => (
                  <SelectItem key={g} value={g} className="capitalize">
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Permission groups</Label>
            <div className="space-y-2 rounded-md border p-3">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center justify-between text-sm">
                  <span>{g.name}</span>
                  <Switch
                    checked={customGroups.includes(g.id)}
                    disabled={isSuperAdmin && g.id === ADMIN_GROUP_ID}
                    onCheckedChange={(checked) =>
                      setCustomGroups((prev) => (checked ? [...prev, g.id] : prev.filter((id) => id !== g.id)))
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Permission overrides</Label>
            <p className="text-xs text-muted-foreground">Overrides beat group membership either way.</p>
            <div className="divide-y rounded-md border">
              {permissions.map((p) => (
                <div key={p.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm">{p.label}</span>
                  <Select
                    value={overrides[p.key] ?? 'inherit'}
                    disabled={isSuperAdmin && p.key === USERS_MANAGE}
                    onValueChange={(v) => setOverrides((prev) => ({ ...prev, [p.key]: v as OverrideState }))}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">Inherit</SelectItem>
                      <SelectItem value="allow">Always allow</SelectItem>
                      {!(isSuperAdmin && p.key === USERS_MANAGE) && <SelectItem value="deny">Always deny</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
