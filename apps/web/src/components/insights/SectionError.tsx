import { Button } from '@/components/ui/button';

/** A section that could not load: what went wrong, and a way to try again. */
export function SectionError({
  what,
  message,
  onRetry,
}: {
  what: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="rounded-lg border bg-background p-6 text-center">
      <p className="mb-3">
        Could not load {what}. {message}
      </p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}
