import { useParams, useLocation } from 'wouter';
import { Users, ShieldCheck, Settings as SettingsIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AdminUsers } from './AdminUsers';
import { AdminGroups } from './AdminGroups';
import { AdminSettings } from './AdminSettings';

export function AdminPanel() {
  const params = useParams();
  const tab = params.tab || 'users';
  const [, navigate] = useLocation();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
        <p className="mt-1 text-muted-foreground">
          Create accounts, assign roles, manage permission groups, and set hospital-wide options.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => navigate(`/admin/${v}`)}>
        <TabsList>
          <TabsTrigger value="users">
            <Users className="mr-1.5 h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="groups">
            <ShieldCheck className="mr-1.5 h-4 w-4" />
            Groups
          </TabsTrigger>
          <TabsTrigger value="settings">
            <SettingsIcon className="mr-1.5 h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <AdminUsers />
        </TabsContent>
        <TabsContent value="groups">
          <AdminGroups />
        </TabsContent>
        <TabsContent value="settings">
          <AdminSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
