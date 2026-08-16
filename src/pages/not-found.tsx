import { useLocation } from 'wouter';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const [, navigate] = useLocation();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Compass className="h-7 w-7" />
      </span>
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
      <Button className="mt-5" onClick={() => navigate('/cases')}>
        Back to dashboard
      </Button>
    </div>
  );
}
