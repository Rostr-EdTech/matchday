import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="scrollbar-thin w-full overflow-x-auto rounded-xl border border-border bg-card">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-muted text-left", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-border last:border-0 hover:bg-muted", className)} {...props} />;
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("whitespace-nowrap px-3 py-2.5 align-middle", className)} {...props} />;
}
