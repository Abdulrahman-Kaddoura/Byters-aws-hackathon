import { useLocation } from 'wouter';
import { MessageSquarePlus, Loader2, MessagesSquare } from 'lucide-react';
import type { PatientCase } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Transcript } from '@/components/Chat';
import { useCreateConversation } from '@/hooks/useCases';
import { setKioskLock } from '@/lib/kiosk';

/** Doctor-facing view of every extra chat session on this case — return
 * visits and follow-ups layered on top of the primary intake interview. */
export function CaseConversations({ caseData: c }: { caseData: PatientCase }) {
  const [, navigate] = useLocation();
  const createConversation = useCreateConversation(c.id);
  const conversations = c.conversations ?? [];

  async function startSession() {
    const res = await createConversation.mutateAsync(undefined);
    // Lock the device before handing it over, exactly as at admission.
    setKioskLock(c.id, res.conversation.id);
    navigate(`/cases/${c.id}/patient-mode/${res.conversation.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Patient Sessions</h2>
        <Button onClick={startSession} disabled={createConversation.isPending}>
          {createConversation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="mr-2 h-4 w-4" />}
          New patient session
        </Button>
      </div>

      {conversations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <MessagesSquare className="h-8 w-8 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              No follow-up sessions yet. Start one and hand the device to the patient for a return visit or a new question —
              separate from the original intake interview.
            </p>
          </CardContent>
        </Card>
      ) : (
        conversations
          .slice()
          .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
          .map((conv) => (
            <Card key={conv.id}>
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-between border-b pb-3">
                  <h3 className="font-semibold">{conv.title}</h3>
                  <span className="text-xs text-muted-foreground">{new Date(conv.updatedAt).toLocaleString()}</span>
                </div>
                {conv.messages.length > 0 ? (
                  <Transcript messages={conv.messages} />
                ) : (
                  <p className="text-sm text-muted-foreground">Not started yet.</p>
                )}
              </CardContent>
            </Card>
          ))
      )}
    </div>
  );
}
