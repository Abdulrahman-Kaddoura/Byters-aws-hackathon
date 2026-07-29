import { useState } from 'react';
import { ChevronDown, Sparkles, BookMarked, Gauge, CheckCircle2, XCircle, FlaskConical } from 'lucide-react';
import type { PatientCase, Diagnosis } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ConfidenceMeter } from '@/components/common';
import { PriorityBadge } from '@/components/badges';
import { DiagnosisDetail, type DetailTab } from '@/components/DiagnosisDetail';
import { cn } from '@/lib/utils';

export function DiagnosisCard({ caseData, diagnosis, rank }: { caseData: PatientCase; diagnosis: Diagnosis; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const [drawer, setDrawer] = useState<DetailTab | null>(null);

  return (
    <>
      <Card className={cn('overflow-hidden transition-shadow hover:shadow-md', rank === 1 && 'ring-1 ring-primary/30')}>
        {rank === 1 && (
          <div className="flex items-center gap-1.5 bg-primary/10 px-4 py-1.5 text-[11px] font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Leading diagnosis
          </div>
        )}
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">{rank}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold tracking-tight">{diagnosis.name}</h3>
                <PriorityBadge priority={diagnosis.priority} />
                <Badge variant="secondary">{diagnosis.category}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{diagnosis.tagline}</p>
            </div>
          </div>

          <div className="mt-4">
            <ConfidenceMeter value={diagnosis.confidence} height={8} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Supporting ({diagnosis.supporting.length})
              </p>
              <ul className="space-y-1">
                {diagnosis.supporting.slice(0, expanded ? undefined : 3).map((s, i) => (
                  <li key={i} className="text-[13px] leading-snug text-muted-foreground">
                    • {s}
                  </li>
                ))}
                {!expanded && diagnosis.supporting.length > 3 && <li className="text-[12px] text-muted-foreground">+{diagnosis.supporting.length - 3} more</li>}
              </ul>
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <XCircle className="h-3.5 w-3.5 text-rose-500" /> Contradicting ({diagnosis.contradicting.length})
              </p>
              <ul className="space-y-1">
                {diagnosis.contradicting.length ? (
                  diagnosis.contradicting.slice(0, expanded ? undefined : 3).map((s, i) => (
                    <li key={i} className="text-[13px] leading-snug text-muted-foreground">
                      • {s}
                    </li>
                  ))
                ) : (
                  <li className="text-[13px] text-muted-foreground">None significant</li>
                )}
              </ul>
            </div>
          </div>

          {expanded && (
            <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-3.5">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reasoning</p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{diagnosis.reasoning}</p>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <FlaskConical className="h-3.5 w-3.5" /> Recommended tests
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {diagnosis.recommendedTests.map((t, i) => (
                    <Badge key={i} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setExpanded((e) => !e)}>
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
              {expanded ? 'Collapse' : 'Expand'}
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button variant="outline" size="sm" onClick={() => setDrawer('explanation')}>
              <Gauge className="h-3.5 w-3.5" /> Explain
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDrawer('evidence')}>
              <BookMarked className="h-3.5 w-3.5" /> Evidence
            </Button>
            <Button size="sm" onClick={() => setDrawer('discussion')}>
              <Sparkles className="h-3.5 w-3.5" /> Discuss with AI
            </Button>
          </div>
        </CardContent>
      </Card>

      <Sheet open={drawer !== null} onOpenChange={(open) => !open && setDrawer(null)}>
        <SheetContent className="flex w-full flex-col sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{diagnosis.name}</SheetTitle>
            <SheetDescription>
              {diagnosis.confidence}% confidence · {caseData.patient.name}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">{drawer && <DiagnosisDetail caseData={caseData} diagnosis={diagnosis} initialTab={drawer} />}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
