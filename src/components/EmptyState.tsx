import { Card, CardContent } from "@/components/ui/card";

interface Props {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="rounded-full bg-muted p-3 text-muted-foreground">{icon}</div>
        <div>
          <div className="text-base font-medium">{title}</div>
          <div className="mt-1 max-w-md text-sm text-muted-foreground">{description}</div>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

// A small library of inline SVG icons for empty states. Keeps us off icon-library deps.
export const EmptyIcons = {
  Machines: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
  ),
  Jobs: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h10M7 17h6" strokeLinecap="round" />
    </svg>
  ),
  Workflow: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="12" cy="18" r="3" />
      <path d="M9 6h6M7 9l4 6M17 9l-4 6" />
    </svg>
  ),
  Schedule: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  ),
  Health: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 12h4l3-8 4 16 3-8h4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  ),
  Bell: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" />
    </svg>
  ),
  Apps: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  Backup: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 6.5C20 5.1 18.4 4 16.5 4S13 5.1 13 6.5M4 7.5v9c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-9" />
      <ellipse cx="12" cy="7" rx="8" ry="2.5" />
    </svg>
  ),
  Template: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 3h14a2 2 0 0 1 2 2v3H3V5a2 2 0 0 1 2-2zM3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
      <path d="M8 12h8M8 16h5" strokeLinecap="round" />
    </svg>
  ),
};
