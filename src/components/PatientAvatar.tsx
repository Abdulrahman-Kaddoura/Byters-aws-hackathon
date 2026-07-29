import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials, cn } from '@/lib/utils';

export function PatientAvatar({
  name,
  hue = 234,
  size = 40,
  className,
}: {
  name: string;
  hue?: number;
  size?: number;
  className?: string;
}) {
  return (
    <Avatar className={cn(className)} style={{ width: size, height: size }}>
      <AvatarFallback
        className="text-white"
        style={{
          fontSize: size * 0.36,
          background: `linear-gradient(135deg, hsl(${hue} 70% 56%), hsl(${(hue + 40) % 360} 65% 46%))`,
        }}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
